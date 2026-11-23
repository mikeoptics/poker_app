<script>
	import { onMount } from 'svelte';
	/** @type {any} */
	let scan = $state({ status: 'idle', venues: [], checked: 0, nextId: 1, currentWeek: 1, scanning: false, lastError: '' });
	let loading = $state(true);
	let error = $state('');
	let refreshing = $state(false);
	let search = $state('');
	/** @type {ReturnType<typeof setInterval> | undefined} */
	let pollTimer;

	async function loadScan(force = false) {
		if (force) refreshing = true;
		try {
			const response = await fetch('/api/admin/venues', { method: force ? 'POST' : 'GET' });
			const data = await response.json();
			if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to load venue scan.');
			scan = data;
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to load venue scan.';
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	async function logout() {
		await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ logout: true }) });
		location.href = '/admin/login';
	}

	const filteredVenues = $derived(scan.venues.filter((venue) => {
		const term = search.trim().toLowerCase();
		return !term || String(venue.venueId).includes(term) || venue.venueName.toLowerCase().includes(term) || venue.eventDay.toLowerCase().includes(term);
	}));

	onMount(() => {
		void loadScan();
		pollTimer = setInterval(() => {
			if (scan.scanning || scan.status === 'idle') void loadScan();
		}, 2000);
		return () => clearInterval(pollTimer);
	});
</script>

<svelte:head><title>Venue administration · Stacks</title><meta name="robots" content="noindex,nofollow" /></svelte:head>

<div class="admin-shell">
	<header>
		<div><p class="eyebrow">STACKS / ADMIN</p><h1>Redtooth venues</h1><p class="muted">Season {scan.season ?? '—'} · Week {scan.currentWeek ?? '—'} of 13</p></div>
		<div class="actions"><button class="secondary" onclick={() => loadScan(true)} disabled={refreshing || scan.scanning}>{refreshing || scan.scanning ? 'Scanning…' : 'Rescan venues'}</button><button class="quiet" onclick={logout}>Sign out</button></div>
	</header>

	{#if error}<p class="error">{error}</p>{/if}
	{#if scan.lastError}<p class="warning">{scan.lastError}</p>{/if}

	<section class="stats">
		<div><span>Valid venues</span><strong>{scan.venues.length.toLocaleString('en-GB')}</strong></div>
		<div><span>IDs checked</span><strong>{scan.checked.toLocaleString('en-GB')}</strong></div>
		<div><span>Scan status</span><strong class:gold={scan.status === 'scanning'}>{scan.status === 'complete' ? 'Complete' : scan.status === 'scanning' ? 'In progress' : scan.status}</strong></div>
	</section>

	<div class="table-heading"><h2>Venue directory</h2><input bind:value={search} placeholder="Search venue, day or ID" aria-label="Search venues" /></div>
	{#if loading}<p class="muted">Loading venue directory…</p>
	{:else if scan.scanning && !scan.venues.length}<div class="empty">Checking Redtooth venue IDs. The list will populate as valid venues are found.</div>
	{:else if !filteredVenues.length}<div class="empty">{scan.status === 'complete' ? 'No venues matched your search.' : 'No venues found yet.'}</div>
	{:else}
		<div class="table-wrap"><table><thead><tr><th>Venue</th><th>Event day</th><th>ID</th><th>Latest upload</th><th>Status</th></tr></thead><tbody>
			{#each filteredVenues as venue (venue.venueId)}
				<tr><td><a href={'/admin/' + venue.venueId}>{venue.venueName}</a></td><td>{venue.eventDay}</td><td class="number">{venue.venueId}</td><td class="number">{venue.latestWeek === null ? 'Unknown' : 'Week ' + venue.latestWeek + ' / ' + scan.currentWeek}</td><td><span class="status" class:current={venue.uploadStatus === 'current'} class:behind={venue.uploadStatus === 'behind'} class:ahead={venue.uploadStatus === 'ahead'}>{venue.uploadStatus === 'current' ? 'Up to date' : venue.uploadStatus === 'behind' ? 'Behind' : venue.uploadStatus === 'ahead' ? 'Ahead of calendar' : 'Unknown'}</span></td></tr>
			{/each}
		</tbody></table></div>
	{/if}
	<footer>{#if scan.status === 'complete'}Scan completed {scan.completedAt ? new Date(scan.completedAt).toLocaleString('en-GB') : ''}.{:else}Scanning sequential venue IDs from 1. This page updates automatically.{/if}</footer>
</div>

<style>
	:global(*){box-sizing:border-box}:global(body){margin:0;background:#101214;color:#f4f4f1;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
	.admin-shell{max-width:1200px;margin:0 auto;padding:clamp(20px,4vw,48px)}
	header,.actions,.table-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}
	header{margin-bottom:30px}.eyebrow{font-size:.7rem;letter-spacing:.15em;font-weight:800;color:#c5a15a}
	h1{font-size:clamp(2rem,5vw,3rem);letter-spacing:-.05em;margin:8px 0}.muted,footer{color:#9ca4ab}.muted{margin:0}
	.actions{flex-wrap:wrap}button{border:1px solid #444b52;border-radius:8px;padding:10px 14px;background:#24292e;color:#f4f4f1;cursor:pointer}button:disabled{opacity:.5;cursor:wait}.quiet{background:transparent;border-color:transparent;color:#aeb5bb}
	.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:28px 0}.stats>div{padding:18px;border:1px solid #30363c;border-radius:12px;background:#191d21}.stats span,.stats strong{display:block}.stats span{color:#9ca4ab;font-size:.8rem}.stats strong{font-size:1.7rem;margin-top:7px}.gold{color:#c5a15a}
	.table-heading{margin:32px 0 14px}.table-heading h2{margin:0;font-size:1.15rem}input{width:min(320px,100%);padding:11px 13px;border:1px solid #414950;border-radius:8px;background:#191d21;color:#fff;font:inherit}
	.table-wrap{overflow:auto;border:1px solid #30363c;border-radius:12px}table{width:100%;border-collapse:collapse;min-width:680px}th,td{text-align:left;padding:14px 16px;border-bottom:1px solid #2b3035}th{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:#929ba3;background:#191d21}tbody tr:last-child td{border-bottom:0}tbody tr:hover{background:#1b2024}td a{color:#f4f4f1;text-decoration:none;font-weight:650}td a:hover{color:#c5a15a}.number{font-variant-numeric:tabular-nums}
	.status{display:inline-block;padding:5px 9px;border-radius:20px;background:#343a40;color:#c4cbd0;font-size:.76rem}.status.current{background:#18352a;color:#8ed0aa}.status.behind{background:#402323;color:#edaaaa}.status.ahead{background:#33304a;color:#c6b8ef}
	.empty{padding:36px;text-align:center;color:#aeb5bb;border:1px dashed #3b4249;border-radius:12px}.error,.warning{padding:12px 14px;border-radius:8px;background:#3c2525;color:#f0b4b4}.warning{background:#3c3423;color:#e4ca8b}footer{margin-top:20px;font-size:.8rem}
	@media(max-width:650px){header,.table-heading{align-items:flex-start;flex-direction:column}.stats{gap:8px}.stats>div{padding:12px}.stats strong{font-size:1.35rem}.table-heading input{width:100%}}
</style>
