<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	const venueId = $derived(page.params.venueid);
	/** @type {any} */
	let tournamentState = $state(null);
	let error = $state('');
	let clockNow = $state(Date.now());
	/** @type {ReturnType<typeof setInterval> | undefined} */
	let pollTimer;
	/** @type {ReturnType<typeof setInterval> | undefined} */
	let tickTimer;
	let lastAnnouncementId = '';
	let announcementInitialized = false;
	const showAnnouncement = $derived(
		Boolean(tournamentState?.announcementEvent?.text) &&
		clockNow - Number(tournamentState.announcementEvent.createdAt || 0) < 15000
	);
	const remainingMs = $derived(
		tournamentState
			? Math.max(
					0,
					Number(tournamentState.remainingMs || 0) -
						(tournamentState.running ? clockNow - Number(tournamentState.updatedAt || clockNow) : 0)
				)
			: 0
	);
	const seconds = $derived(Math.ceil(remainingMs / 1000));
	const timerText = $derived(
		String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
	);
	async function refresh() {
		try {
			const response = await fetch('/api/tournament/' + venueId + '?public=1', {
				cache: 'no-store'
			});
			if (!response.ok) throw new Error('Tournament display is not available.');
			const result = await response.json();
			if (!result.ok || !result.state) throw new Error('Waiting for tournament data.');
			const nextAnnouncement = result.state.announcementEvent;
			if (!announcementInitialized) {
				lastAnnouncementId = nextAnnouncement?.id ?? '';
				announcementInitialized = true;
			} else if (nextAnnouncement?.id && nextAnnouncement.id !== lastAnnouncementId) {
				lastAnnouncementId = nextAnnouncement.id;
				if (typeof window !== 'undefined' && 'speechSynthesis' in window && nextAnnouncement.text) {
					const speakAnnouncement = () => {
						window.speechSynthesis.cancel();
						window.speechSynthesis.resume();
						const utterance = new SpeechSynthesisUtterance(nextAnnouncement.text);
						utterance.lang = 'en-GB';
						utterance.rate = 0.95;
						const voices = window.speechSynthesis.getVoices();
						const preferredVoice = voices.find((voice) => voice.lang === 'en-GB') ||
							voices.find((voice) => voice.lang.startsWith('en-'));
						if (preferredVoice) utterance.voice = preferredVoice;
						window.speechSynthesis.speak(utterance);
					};
					if (window.speechSynthesis.getVoices().length) {
						speakAnnouncement();
					} else {
						window.speechSynthesis.addEventListener('voiceschanged', speakAnnouncement, { once: true });
						// Some Cast browsers do not fire voiceschanged; retry with the
						// browser's default voice after the initial voice list settles.
						setTimeout(() => {
							if (window.speechSynthesis.pending || window.speechSynthesis.speaking) return;
						window.speechSynthesis.removeEventListener('voiceschanged', speakAnnouncement);
						speakAnnouncement();
						}, 700);
					}
				}
			}
			tournamentState = result.state;
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to load tournament display.';
		}
	}
	onMount(() => {
		refresh();
		pollTimer = setInterval(refresh, 1000);
		tickTimer = setInterval(() => {
			clockNow = Date.now();
		}, 200);
		return () => {
			clearInterval(pollTimer);
			clearInterval(tickTimer);
		};
	});
</script>

<svelte:head
	><title>Live Tournament Display</title><meta
		name="viewport"
		content="width=device-width, initial-scale=1"
	/></svelte:head
>
<div class="screen">
	<header>
		<div class="eyebrow">LIVE TOURNAMENT</div>
		<h1>{tournamentState?.venueName || 'Tournament display'}</h1>
	</header>
	{#if error && !tournamentState}<div class="waiting">{error}</div>{:else}
		{#if showAnnouncement}
			<div class="move-announcement" role="status" aria-live="assertive">{tournamentState.announcementEvent.text}</div>
		{/if}
		<div class="layout">
			<main class="timer-panel">
				<div class="game">{tournamentState?.currentGame || 'WAITING'}</div>
				<div class="timer">{timerText}</div>
				<div class="blinds">{tournamentState?.blinds || '—'}</div>
				<div class="status">
					{tournamentState?.running
						? 'TOURNAMENT RUNNING'
						: tournamentState?.tournamentStarted
							? 'TOURNAMENT PAUSED'
							: 'WAITING TO START'}
				</div>
				<div class="next">
					NEXT: {tournamentState?.nextGame || '—'} · {tournamentState?.nextBlinds || '—'} · PLAYERS: {tournamentState?.activePlayerCount ??
						0}
				</div>
			</main>
			<aside class="standings">
				<div class="standings-title">LEAGUE STANDINGS</div>
				<div class="standings-caption">Current season · live points</div>
				<div class="columns"><span>#</span><span>PLAYER</span><span>GP</span><span>PTS</span></div>
				<div class="rows">
					{#each (tournamentState?.standings ?? []).slice(0, 18) as row}
						<div
							class="standing-row"
							class:live={row.attendanceStatus === 'live'}
							class:locked={row.attendanceStatus === 'locked'}
							class:absent={row.attendanceStatus === 'absent' ||
								row.attendanceStatus === 'attending'}
						>
							<span>{row.position}</span><strong>{row.name}</strong><span>{row.games}</span><b
								>{row.points}</b
							>
						</div>
					{:else}<div class="waiting">Waiting for league standings…</div>{/each}
				</div>
			</aside>
		</div>
	{/if}
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}
	:global(html),
	:global(body) {
		margin: 0;
		min-height: 100%;
		background: #090d11;
		color: #f5f6f7;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}
	.screen {
		min-height: 100vh;
		padding: 2.5vh 3vw;
		display: flex;
		flex-direction: column;
		gap: 2vh;
		background: radial-gradient(circle at 20% 0%, #17242a, transparent 48%), #090d11;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 2rem;
	}
	.eyebrow {
		color: #7e8c93;
		font-size: clamp(0.7rem, 1vw, 1rem);
		font-weight: 800;
		letter-spacing: 0.2em;
	}
	h1 {
		margin: 0;
		font-size: clamp(1.4rem, 2.5vw, 2.5rem);
		text-align: right;
	}
	.move-announcement {
			flex: 0 0 auto;
			padding: 16px 22px;
			border: 1px solid #8d7548;
			border-radius: 12px;
			background: linear-gradient(110deg, #3a3020, #25251f);
			color: #ffe3a3;
			font-size: clamp(1rem, 2vw, 2rem);
			font-weight: 900;
			letter-spacing: .015em;
			text-align: center;
			box-shadow: 0 8px 28px rgba(0,0,0,.25);
		}
	.layout {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(330px, 0.85fr);
		gap: 2vw;
	}
	.timer-panel,
	.standings {
		background: rgba(21, 27, 32, 0.92);
		border: 1px solid #29343b;
		border-radius: 18px;
		min-height: 0;
	}
	.timer-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3vh 2vw;
	}
	.game {
		color: #d2b27a;
		font-size: clamp(1.3rem, 3vw, 3rem);
		font-weight: 900;
		letter-spacing: 0.12em;
	}
	.timer {
		font-size: clamp(6rem, 15vw, 17rem);
		font-weight: 900;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.06em;
	}
	.blinds {
		font-size: clamp(2.5rem, 6vw, 6rem);
		font-weight: 800;
	}
	.status {
		margin-top: 3vh;
		color: #8b989e;
		font-size: clamp(0.7rem, 1vw, 1rem);
		font-weight: 800;
		letter-spacing: 0.16em;
	}
	.next {
		margin-top: 2vh;
		color: #aab4b9;
		font-size: clamp(0.8rem, 1.25vw, 1.2rem);
		text-align: center;
	}
	.standings {
		padding: 2vh 1.5vw;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.standings-title {
		font-size: clamp(1rem, 1.6vw, 1.6rem);
		font-weight: 900;
		letter-spacing: 0.1em;
	}
	.standings-caption {
		color: #7f8b91;
		font-size: clamp(0.7rem, 0.9vw, 0.9rem);
		margin: 0.5vh 0 2vh;
	}
	.columns,
	.standing-row {
		display: grid;
		grid-template-columns: 2.2rem minmax(0, 1fr) 2.6rem 3.5rem;
		gap: 0.5rem;
		align-items: center;
	}
	.columns {
		padding: 0.7vh 0.4vw;
		color: #7f8b91;
		font-size: clamp(0.65rem, 0.8vw, 0.85rem);
		font-weight: 800;
		border-bottom: 1px solid #344047;
	}
	.columns span:nth-child(n + 3),
	.standing-row span:nth-child(n + 3),
	.standing-row b {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.rows {
		overflow: hidden;
	}
	.standing-row {
		min-height: 4.4vh;
		padding: 0.35vh 0.4vw;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		font-size: clamp(0.75rem, 1.15vw, 1.15rem);
	}
	.standing-row strong {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.standing-row.live span,
	.standing-row.live b {
		color: #62d394;
	}
	.standing-row.locked span,
	.standing-row.locked b {
		color: #d8b45b;
	}
	.standing-row.absent {
		color: #858b91;
		opacity: 0.6;
		filter: grayscale(1);
	}
	.standing-row.absent span,
	.standing-row.absent strong,
	.standing-row.absent b {
		color: #858b91;
	}
	.waiting {
		color: #89949a;
		padding: 2rem;
		text-align: center;
	}
	@media (max-width: 800px) {
		.screen {
			padding: 2vh 3vw;
		}
		.layout {
			grid-template-columns: 1fr;
		}
		.timer-panel {
			min-height: 48vh;
		}
		.standings {
			min-height: 40vh;
		}
		.timer {
			font-size: clamp(5rem, 20vw, 10rem);
		}
		.standing-row {
			min-height: 3.2vh;
		}
	}
</style>
