<script>
	import { goto } from '$app/navigation';
	/** @typedef {{ venueid: number; venuename: string; address1?: string; town?: string; postcode?: string; gamenight?: string; distanceMiles?: number }} RedtoothVenue */
	let search = $state(''),
		loading = $state(false),
		error = $state('');
	/** @type {RedtoothVenue[]} */
	let venues = $state([]);
	/** @type {ReturnType<typeof setTimeout> | null} */
	let timer = null;
	/** @param {string} value */
	async function searchVenues(value) {
		search = value;
		if (timer) clearTimeout(timer);
		if (!value.trim()) {
			venues = [];
			error = '';
			return;
		}
		timer = setTimeout(async () => {
			loading = true;
			error = '';
			try {
				const r = await fetch(
					'/api/redtooth?mode=venues&query=' + encodeURIComponent(value.trim())
				);
				const d = await r.json();
				if (!r.ok || !d.ok) throw new Error(d.error || 'Venue search failed.');
				venues = d.venues || [];
				if (!venues.length) error = 'No venues found. Try a nearby town or postcode.';
			} catch (e) {
				error = e instanceof Error ? e.message : 'Venue search failed.';
				venues = [];
			} finally {
				loading = false;
			}
		}, 350);
	}
	/** @param {RedtoothVenue} v */
	function chooseVenue(v) {
		// Keep the selected Redtooth name available when the installed PWA
		// launches directly from its venue-specific start URL.
		try {
			localStorage.setItem(`poker-venue-name:${v.venueid}`, v.venuename);
		} catch {
			// The URL still carries the name if storage is unavailable.
		}
		goto('/' + v.venueid + '?name=' + encodeURIComponent(v.venuename));
	}
</script>

<svelte:head
	><title>Select venue · Mike's Poker App</title><meta
		name="description"
		content="Choose a Redtooth venue to open its poker tournament."
	/></svelte:head
>
<div class="setup-page">
	<div class="setup-card">
		<p class="eyebrow">MIKE'S POKER APP</p>
		<h1>Select your venue</h1>
		<p class="intro">
			Choose the Redtooth venue hosting this tournament. Each venue has its own timer, players and
			TV display.
		</p>
		<label for="venue-search">Venue, town or postcode</label><input
			id="venue-search"
			value={search}
			oninput={(e) => searchVenues(e.currentTarget.value)}
			placeholder="e.g. Ipswich or IP1 1AA"
			autocomplete="off"
		/>{#if loading}<p class="status">Searching venues…</p>{/if}{#if error}<p class="error">
				{error}
			</p>{/if}
		<div class="results">
			{#each venues as venue (venue.venueid)}<button
					class="venue"
					onclick={() => chooseVenue(venue)}
					><span
						><strong>{venue.venuename}</strong><small
							>{[venue.address1, venue.town, venue.postcode].filter(Boolean).join(', ')}</small
						></span
					><span class="meta"
						>{typeof venue.distanceMiles === 'number' && Number.isFinite(venue.distanceMiles)
							? venue.distanceMiles.toFixed(1) + ' mi'
							: ''}{#if venue.gamenight}<small>{venue.gamenight}</small>{/if}</span
					></button
				>{/each}
		</div>
	</div>
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		margin: 0;
		min-height: 100vh;
		background: #101214;
		color: #f4f4f1;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	.setup-page {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 24px;
		background:
			radial-gradient(circle at top, rgba(255, 255, 255, 0.06), transparent 32rem), #101214;
	}
	.setup-card {
		width: min(620px, 100%);
		padding: clamp(24px, 5vw, 44px);
		border: 1px solid #343a40;
		border-radius: 18px;
		background: #181b1f;
		box-shadow: 0 24px 70px #0005;
	}
	.eyebrow,
	label {
		color: #9aa1a8;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	h1 {
		margin: 8px 0;
		font-size: clamp(2rem, 6vw, 3rem);
		letter-spacing: -0.05em;
	}
	.intro {
		color: #aeb5bb;
		line-height: 1.6;
		margin: 0 0 28px;
	}
	input {
		display: block;
		width: 100%;
		margin-top: 9px;
		padding: 14px 15px;
		border: 1px solid #4b535b;
		border-radius: 9px;
		background: #101214;
		color: #fff;
		font-size: 1rem;
		outline: none;
	}
	input:focus {
		border-color: #c4a36a;
	}
	.results {
		display: grid;
		gap: 7px;
		margin-top: 16px;
	}
	.venue {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		width: 100%;
		padding: 14px;
		border: 1px solid #343a40;
		border-radius: 9px;
		background: #202428;
		color: #f4f4f1;
		text-align: left;
		cursor: pointer;
	}
	.venue:hover {
		border-color: #c4a36a;
		background: #292e33;
	}
	.venue strong,
	.venue small,
	.meta small {
		display: block;
	}
	.venue small,
	.meta {
		margin-top: 4px;
		color: #aeb5bb;
		font-size: 0.78rem;
	}
	.meta {
		flex: 0 0 auto;
		text-align: right;
	}
	.status {
		color: #c4a36a;
	}
	.error {
		color: #e18c8c;
	}
</style>
