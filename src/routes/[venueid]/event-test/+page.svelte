<script>
	import { page } from '$app/state';
	const venueId = $derived(page.params.venueid);
	let status = $state('Ready');
	let details = $state('');
	let busy = $state(false);

	async function triggerEvent(type) {
		if (busy) return;
		busy = true;
		status = 'Loading current tournament state…';
		details = '';
		try {
			const getResponse = await fetch(`/api/tournament/${venueId}`, { cache: 'no-store' });
			const current = await getResponse.json();
			if (!getResponse.ok || !current.ok || !current.state) {
				throw new Error(current.error || 'Could not load tournament state.');
			}
			const now = Date.now();
			const id = `event-test-${type}-${now}`;
			const state = { ...current.state };
			if (type === 'table-move') {
				state.tableMoveEvent = { id, text: 'TEST: Player One, please move to position 4 on table 2', createdAt: now };
			} else if (type === 'announcement') {
				state.announcementEvent = { id, text: 'TEST: The next blinds are 300 / 600', createdAt: now };
			} else {
				state.eliminationEvent = { id, playerName: 'Test Player', createdAt: now };
			}
			status = 'Saving test event…';
			const putResponse = await fetch(`/api/tournament/${venueId}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(state)
			});
			const saved = await putResponse.json();
			if (!putResponse.ok || !saved.ok) throw new Error(saved.error || 'Save failed.');
			status = 'Saved. Checking public display response…';
			const publicResponse = await fetch(`/api/tournament/${venueId}?public=1`, { cache: 'no-store' });
			const publicResult = await publicResponse.json();
			if (!publicResponse.ok || !publicResult.ok) throw new Error('Public API read failed.');
			const key = type === 'table-move' ? 'tableMoveEvent' : type === 'announcement' ? 'announcementEvent' : 'eliminationEvent';
			const received = publicResult.state?.[key];
			const passed = received?.id === id;
			status = passed ? 'PASS: event saved and returned by public API.' : 'FAIL: event was not returned by public API.';
			details = JSON.stringify({ expectedId: id, publicApiEvent: received ?? null }, null, 2);
		} catch (error) {
			status = 'ERROR';
			details = error instanceof Error ? error.message : String(error);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Event Diagnostics</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main>
	<h1>Event diagnostics</h1>
	<p>Venue {venueId}. These buttons write test events to this tournament. They do not change players, seats, blinds or timer settings.</p>
	<div class="actions">
		<button disabled={busy} onclick={() => triggerEvent('table-move')}>Test table-move event</button>
		<button disabled={busy} onclick={() => triggerEvent('announcement')}>Test spoken announcement</button>
		<button disabled={busy} onclick={() => triggerEvent('elimination')}>Test elimination event</button>
	</div>
	<p class="status">{status}</p>
	{#if details}<pre>{details}</pre>{/if}
	<p><a href={`/${venueId}/display`} target="_blank" rel="noreferrer">Open standalone display</a></p>
	<p><a href={`/${venueId}`}>Return to tournament admin</a></p>
</main>

<style>
	main { max-width: 760px; margin: 0 auto; padding: 32px 20px; color: #f5f5f5; font: 16px/1.5 system-ui, sans-serif; }
	.actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0; }
	button { border: 0; border-radius: 8px; padding: 12px 16px; background: #2563eb; color: white; font: inherit; cursor: pointer; }
	button:disabled { opacity: .5; cursor: wait; }
	.status { padding: 12px; background: #20242b; border-radius: 8px; }
	pre { overflow: auto; padding: 16px; background: #111827; border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
	a { color: #93c5fd; }
</style>
