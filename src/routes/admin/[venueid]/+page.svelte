<script>
	import { onMount } from 'svelte';
	let { data } = $props();
	/** @type {any} */
	let dashboard = $state(null);
	let loading = $state(true);
	let error = $state('');
	async function load() {
		loading = true;
		try {
			const response = await fetch('/api/admin/venue/' + data.venueId);
			const result = await response.json();
			if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to load venue.');
			dashboard = result;
		} catch (e) { error = e instanceof Error ? e.message : 'Unable to load venue.'; }
		finally { loading = false; }
	}
	onMount(() => { void load(); });
</script>
<svelte:head><title>{dashboard?.venue?.venueName ?? 'Venue'} · Stacks Admin</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<main>
	<a class="back" href="/admin">← All venues</a>
	{#if loading}<p class="muted">Loading venue statistics…</p>
	{:else if error}<p class="error">{error}</p>
	{:else if dashboard}
		<header><div><p class="eyebrow">VENUE / {dashboard.venue.venueId}</p><h1>{dashboard.venue.venueName}</h1><p class="muted">{dashboard.venue.eventDay} · Season {dashboard.season.season} · Week {dashboard.currentWeek} of 13</p></div></header>
		<section class="stats">
			<div><span>Average weekly players</span><strong>{dashboard.averageWeeklyPlayers}</strong><small>{dashboard.totalPlayerWeeks} player-weeks ÷ {dashboard.currentWeek} weeks</small></div>
			<div><span>New players this season</span><strong>{dashboard.newPlayers.length}</strong><small>Compared with previous season</small></div>
			<div><span>Not returned this season</span><strong>{dashboard.inactivePlayers.length}</strong><small>Played last season, absent this season</small></div>
			<div><span>Top points-per-game average</span><strong>{dashboard.topByAverage?.name ?? '—'}</strong><small>{dashboard.topByAverage ? (dashboard.topByAverage.points / dashboard.topByAverage.games).toFixed(1) + ' points per game' : 'No results yet'}</small></div>
		</section>
		<section class="panel"><h2>Current season standings</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>Player</th><th>Games</th><th>Points</th><th>Points / game</th></tr></thead><tbody>{#each dashboard.players as player (player.redtoothId ?? player.name)}<tr><td>{player.position}</td><td>{player.name}</td><td>{player.games}</td><td>{player.points}</td><td>{player.games ? (player.points / player.games).toFixed(1) : '—'}</td></tr>{/each}</tbody></table></div></section>
		<div class="columns"><section class="panel"><h2>New this season</h2>{#if dashboard.newPlayers.length}<ul>{#each dashboard.newPlayers as player (player.redtoothId)}<li>{player.name}</li>{/each}</ul>{:else}<p class="muted">No new players identified.</p>{/if}</section><section class="panel"><h2>Not returned this season</h2>{#if dashboard.inactivePlayers.length}<ul>{#each dashboard.inactivePlayers as player (player.redtoothId)}<li>{player.name}</li>{/each}</ul>{:else}<p class="muted">No previous-season players missing.</p>{/if}</section></div>
		<p class="footnote">Attendance average is calculated from the total player-week count divided by the current season week. Player comparisons use Redtooth player IDs where available.</p>
	{/if}
</main>
<style>
	:global(body){margin:0;background:#101214;color:#f4f4f1;font-family:Inter,ui-sans-serif,system-ui,sans-serif}main{max-width:1200px;margin:0 auto;padding:clamp(20px,4vw,48px)}.back{color:#c5a15a;text-decoration:none;font-size:.9rem}.eyebrow{color:#c5a15a;font-size:.7rem;letter-spacing:.14em;font-weight:800;margin-top:28px}h1{font-size:clamp(2rem,5vw,3rem);letter-spacing:-.05em;margin:8px 0}.muted,.footnote{color:#9ca4ab}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:30px 0}.stats>div,.panel{padding:18px;border:1px solid #30363c;border-radius:12px;background:#191d21}.stats span,.stats strong,.stats small{display:block}.stats span{color:#9ca4ab;font-size:.8rem}.stats strong{font-size:1.6rem;margin:8px 0}.stats small{color:#8d969e;font-size:.75rem;line-height:1.4}.panel{margin-bottom:16px}.panel h2{font-size:1.05rem;margin:0 0 16px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:520px}th,td{text-align:left;padding:11px 12px;border-bottom:1px solid #2c3238}th{color:#9ca4ab;font-size:.72rem;text-transform:uppercase;letter-spacing:.07em}tbody tr:last-child td{border:0}.columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}ul{padding-left:20px;columns:2;color:#d5d9dc}li{padding:4px 0}.footnote{font-size:.78rem;line-height:1.5}.error{color:#efaaaa}@media(max-width:800px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.columns{grid-template-columns:1fr}.stats{gap:8px}.stats>div{padding:13px}.stats strong{font-size:1.25rem}}
</style>
