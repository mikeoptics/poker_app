import { json } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startPushScheduler } from '$lib/server/push-notifications';

startPushScheduler();
const DATA_DIR = path.resolve('.data', 'venues');
/** @param {string | number | null | undefined} id */
const valid = (id) => /^\d{1,12}$/.test(String(id ?? ''));
/** @param {string | number} id */
const file = (id) => path.join(DATA_DIR, id + '.json');
/** @param {string | number} id */
async function read(id) {
	try {
		return JSON.parse(await fs.readFile(file(id), 'utf8'));
	} catch (e) {
		if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') return null;
		throw e;
	}
}
/** @param {any} s */
function publicState(s) {
	if (!s) return null;
	let i = Math.max(0, Number(s.currentLevel ?? 0));
	let remaining = Math.max(0, Number(s.remainingMs ?? 0));
	let displayRunning = Boolean(s.running);
	const elapsed = displayRunning ? Math.max(0, Date.now() - (s.updatedAt ?? Date.now())) : 0;
	remaining -= elapsed;
	// Advance the public display through any levels that elapsed while the
	// director's browser was backgrounded or suspended.
	while (displayRunning && remaining <= 0 && i < (s.levels?.length ?? 0) - 1) {
		i += 1;
		remaining += Math.max(1, Number(s.levels?.[i]?.minutes ?? 1)) * 60_000;
	}
	if (displayRunning && remaining <= 0) {
		remaining = 0;
		displayRunning = false;
	}
	const l = s.levels?.[i] ?? null;
	const n = s.levels?.[Math.min(i + 1, (s.levels?.length ?? 1) - 1)] ?? null;
	/** @type {any[]} */
	const tournamentPlayers = s.players ?? [];
	const activePlayers = tournamentPlayers.filter((p) => !p.eliminated);
	const activeCount = activePlayers.length;
	const started = Boolean(
		s.tournamentStarted || s.running || tournamentPlayers.some((p) => p.eliminated)
	);
	const attendees = new Map(
		tournamentPlayers
			.filter((p) => !p.guest && p.redtoothId != null)
			.map((p) => [String(p.redtoothId), p])
	);
	/** @param {number} place */
	const pointsForPlace = (place) =>
		/** @type {Record<number, number>} */ ({
			1: 100,
			2: 80,
			3: 70,
			4: 60,
			5: 50,
			6: 40,
			7: 30,
			8: 20
		})[place] ?? 10;

	/** @type {any[]} */
	const source = s.redtoothPlayers ?? [];
	const regionalPlaces = source.filter((r) => r.qualification === 'regional').length;
	const playoffPlaces = source.filter((r) => r.qualification === 'playoff').length;
	const standings = source
		.map((row) => {
			const player = attendees.get(String(row.redtoothId));
			const attending = Boolean(player);
			const locked = Boolean(player?.eliminated);
			const attendancePoints = started && attending ? 10 : 0;
			const liveMinimum =
				started && attending && !locked && activeCount <= 8
					? Math.max(0, pointsForPlace(activeCount) - 10)
					: 0;
			const existingLocalPoints = Number(row.localPoints ?? 0);
			const livePoints = attendancePoints + liveMinimum;
			const points = Number(row.points ?? 0) + existingLocalPoints + livePoints;
			const games =
				Number(row.games ?? 0) +
				(attending && started
					? Math.max(1, Number(row.localGames ?? 0))
					: Number(row.localGames ?? 0));
			return {
				position: Number(row.position ?? 9999),
				name: String(row.name ?? ''),
				games,
				points,
				qualification: row.qualification ?? null,
				pendingPoints: Number(row.pendingPoints ?? 0) + livePoints,
				attendanceStatus: !attending ? 'absent' : locked ? 'locked' : started ? 'live' : 'attending'
			};
		})
		.sort((a, b) => b.points - a.points || a.games - b.games || a.position - b.position)
		.map((row, index, rows) => {
			const position =
				index > 0 && row.points === rows[index - 1].points ? rows[index - 1].position : index + 1;
			return {
				...row,
				position,
				qualification:
					regionalPlaces > 0 && position <= regionalPlaces
						? 'regional'
						: playoffPlaces > 0 && position <= playoffPlaces
							? 'playoff'
							: null
			};
		});

	return {
		venueName: s.venueName ?? '',
		currentLevel: i,
		currentGame: l?.break ? 'BREAK' : s.mixedGames ? (l?.game ?? 'POKER') : 'POKER',
		blinds: l?.break ? 'BREAK' : l ? l.sb + ' / ' + l.bb : '—',
		nextGame: n?.break ? 'BREAK' : s.mixedGames ? (n?.game ?? '') : 'BLINDS',
		nextBlinds: n?.break ? 'BREAK' : n ? n.sb + ' / ' + n.bb : '—',
		remainingMs: remaining,
		running: displayRunning,
		tournamentStarted: started,
		soundEnabled: s.soundEnabled !== false,
		updatedAt: Date.now(),
		players: tournamentPlayers.map((p) => ({
			name: p.name,
			eliminated: Boolean(p.eliminated),
			position: p.eliminationPosition ?? null
		})),
		activePlayerCount: activeCount,
		eliminationEvent: s.eliminationEvent ?? null,
		announcementEvent: s.announcementEvent ?? null,
		standings
	};
}
export async function GET({ params, url }) {
	if (!valid(params.venueid)) return json({ error: 'Invalid venue ID.' }, { status: 400 });
	try {
		const s = await read(params.venueid);
		return json({ ok: true, state: url.searchParams.get('public') === '1' ? publicState(s) : s });
	} catch (e) {
		console.error('Tournament load failed:', e);
		return json({ ok: false, error: 'Unable to load tournament data.' }, { status: 500 });
	}
}
export async function PUT({ params, request }) {
	if (!valid(params.venueid)) return json({ error: 'Invalid venue ID.' }, { status: 400 });
	try {
		const v = await request.json();
		if (!v || typeof v !== 'object' || !Array.isArray(v.levels) || !Array.isArray(v.players))
			return json({ error: 'Invalid tournament state.' }, { status: 400 });
		const s = {
			levels: v.levels,
			players: v.players,
			nextPlayerId: Number(v.nextPlayerId) || 1,
			currentLevel: Math.max(0, Number(v.currentLevel) || 0),
			remainingMs: Math.max(0, Number(v.remainingMs) || 0),
			levelDurationMs: Math.max(0, Number(v.levelDurationMs) || 0),
			running: Boolean(v.running),
			tournamentStarted: Boolean(v.tournamentStarted || v.running),
			soundEnabled: Boolean(v.soundEnabled),
			announcementEnabled: Boolean(v.announcementEnabled),
			buyInAmount: Math.max(0, Number(v.buyInAmount) || 0),
			maxRebuys: Math.max(0, Number(v.maxRebuys) || 0),
			maxTopUps: Math.max(0, Number(v.maxTopUps) || 0),
			mixedGames: Boolean(v.mixedGames),
			activeTab: ['timer', 'tables', 'setup', 'payouts'].includes(v.activeTab)
				? v.activeTab
				: 'timer',
			redtoothPlayers: Array.isArray(v.redtoothPlayers) ? v.redtoothPlayers : [],
			eliminationEvent:
				v.eliminationEvent &&
				typeof v.eliminationEvent.id === 'string' &&
				typeof v.eliminationEvent.playerName === 'string' &&
				Number.isFinite(Number(v.eliminationEvent.createdAt))
					? {
							id: v.eliminationEvent.id.slice(0, 100),
							playerName: v.eliminationEvent.playerName.slice(0, 160),
							createdAt: Number(v.eliminationEvent.createdAt)
						}
					: null,
			announcementEvent:
				v.announcementEvent &&
				typeof v.announcementEvent.id === 'string' &&
				typeof v.announcementEvent.text === 'string'
					? {
							id: v.announcementEvent.id.slice(0, 100),
							text: v.announcementEvent.text.slice(0, 500),
							createdAt: Number(v.announcementEvent.createdAt) || Date.now()
						}
					: null,
			venueName: String(v.venueName ?? '').slice(0, 160),
			updatedAt: Date.now()
		};
		await fs.mkdir(DATA_DIR, { recursive: true });
		await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
		return json({ ok: true, updatedAt: s.updatedAt });
	} catch (e) {
		console.error('Tournament save failed:', e);
		return json({ ok: false, error: 'Unable to save tournament data.' }, { status: 500 });
	}
}
