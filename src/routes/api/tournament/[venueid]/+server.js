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

// Serialize writes per venue so simultaneous phone/laptop saves cannot race.
const venueWriteQueues = new Map();
/** @param {string | number} id @param {() => Promise<any>} operation */
async function withVenueWriteLock(id, operation) {
	const key = String(id);
	const previous = venueWriteQueues.get(key) ?? Promise.resolve();
	/** @type {() => void} */
	let release = () => {};
	/** @type {Promise<void>} */
	const gate = new Promise((resolve) => { release = resolve; });
	const queued = previous.then(() => gate);
	venueWriteQueues.set(key, queued);
	await previous;
	try {
		return await operation();
	} finally {
		release();
		if (venueWriteQueues.get(key) === queued) venueWriteQueues.delete(key);
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
		tableMoveEvent: s.tableMoveEvent ?? null,
		standings
	};
}
export async function GET({ params, url }) {
	if (!valid(params.venueid)) return json({ error: 'Invalid venue ID.' }, { status: 400 });
	try {
		return await withVenueWriteLock(params.venueid, async () => {
			const s = await read(params.venueid);
			if (s?.running && Array.isArray(s.levels) && s.levels.length) {
				let level = Math.max(0, Math.min(Number(s.currentLevel) || 0, s.levels.length - 1));
				let remaining = Math.max(0, Number(s.remainingMs) || 0) - Math.max(0, Date.now() - Number(s.updatedAt || Date.now()));
				const previousLevel = level;
				while (remaining <= 0 && level < s.levels.length - 1) {
					level += 1;
					remaining += Math.max(1, Number(s.levels[level]?.minutes) || 1) * 60_000;
				}
				if (level !== previousLevel || remaining < 0) {
					const now = Date.now();
					s.currentLevel = level;
					s.levelDurationMs = Math.max(1, Number(s.levels[level]?.minutes) || 1) * 60_000;
					s.remainingMs = Math.max(0, remaining);
					s.updatedAt = now;
					if (level >= s.levels.length - 1 && remaining <= 0) {
						s.remainingMs = 0;
						s.running = false;
					}
					if (level > previousLevel && s.announcementEnabled) {
						const next = s.levels[level];
						const game = s.mixedGames ? String(next?.game ?? '') : '';
						const speechGame = game.replace(/\bPLO5\b/g, 'P L O five').replace(/\bPLO4\b/g, 'P L O four').replace(/\bNLH\b/g, 'N L H');
						const text = next?.break
							? `Break. ${next.minutes} minutes.`
							: `Next level. ${game ? speechGame + '. ' : ''}Blinds ${next?.sb ?? 0} ${next?.bb ?? 0}.`;
						s.announcementEvent = { id: `level-${now}-${level}`, text, createdAt: now };
					}
					await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
				}
			}
			return json({ ok: true, state: url.searchParams.get('public') === '1' ? publicState(s) : s });
		});
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
		// Admin pages may be open on multiple devices. Never let a stale page
		// replace a newer one-shot announcement with an older event or null.
		return await withVenueWriteLock(params.venueid, async () => {
		const existing = await read(params.venueid);
		/** @param {any} incoming @param {any} previous */
		const preserveRecentEvent = (incoming, previous) => {
			const incomingAt = Number(incoming?.createdAt) || 0;
			const previousAt = Number(previous?.createdAt) || 0;
			if (previous && previousAt >= incomingAt && previous.id !== incoming?.id && Date.now() - previousAt < 60_000) return previous;
			return incoming;
		};
		const eliminationEvent = preserveRecentEvent(v.eliminationEvent, existing?.eliminationEvent);
		const announcementEvent = preserveRecentEvent(v.announcementEvent, existing?.announcementEvent);
		const tableMoveEvent = preserveRecentEvent(v.tableMoveEvent, existing?.tableMoveEvent);
		// A sleeping admin tab can submit an older running timer snapshot when it wakes.
		// Do not let that stale snapshot roll back a level already advanced by the server.
		const existingLevel = Number(existing?.currentLevel) || 0;
		const incomingLevel = Number(v.currentLevel) || 0;
		const existingRemaining = Math.max(
			0,
			Number(existing?.remainingMs) - (existing?.running ? Math.max(0, Date.now() - Number(existing?.updatedAt || Date.now())) : 0)
		);
		const sameLevelStaleTimer = Boolean(
			existing?.running && v.running &&
			existingLevel === incomingLevel &&
			Number(existing.levelDurationMs) === Number(v.levelDurationMs) &&
			Number(v.remainingMs) > existingRemaining + 2000
		);
		const keepServerTimer = Boolean(
			existing?.running && v.running &&
			(existingLevel > incomingLevel || sameLevelStaleTimer)
		);
		const s = {
			levels: v.levels,
			players: existing?.players ?? v.players,
			nextPlayerId: Number(existing?.nextPlayerId) || Number(v.nextPlayerId) || 1,
			currentLevel: existing ? Math.max(0, Number(existing.currentLevel) || 0) : 0,
			remainingMs: existing ? existingRemaining : Math.max(1, Number(v.levels[0]?.minutes) || 1) * 60_000,
			levelDurationMs: existing ? Math.max(1, Number(existing.levelDurationMs) || Number(existing.levels?.[existing.currentLevel]?.minutes) * 60_000 || 60_000) : Math.max(1, Number(v.levels[0]?.minutes) || 1) * 60_000,
			running: Boolean(existing?.running),
			tournamentStarted: Boolean(existing?.tournamentStarted || existing?.running || v.tournamentStarted),
			soundEnabled: existing ? Boolean(existing.soundEnabled) : true,
			announcementEnabled: existing ? Boolean(existing.announcementEnabled) : true,
			buyInAmount: existing ? Math.max(0, Number(existing.buyInAmount) || 0) : 5,
			maxRebuys: existing ? Math.max(0, Number(existing.maxRebuys) || 0) : 0,
			maxTopUps: existing ? Math.max(0, Number(existing.maxTopUps) || 0) : 0,
			mixedGames: existing ? Boolean(existing.mixedGames) : false,
			activeTab: ['timer', 'tables', 'setup', 'payouts'].includes(existing?.activeTab)
				? existing.activeTab
				: 'timer',
			redtoothPlayers: Array.isArray(existing?.redtoothPlayers) ? existing.redtoothPlayers : (Array.isArray(v.redtoothPlayers) ? v.redtoothPlayers : []),
			eliminationEvent:
				eliminationEvent &&
				typeof eliminationEvent.id === 'string' &&
				typeof eliminationEvent.playerName === 'string' &&
				Number.isFinite(Number(eliminationEvent.createdAt))
					? {
							id: eliminationEvent.id.slice(0, 100),
							playerName: eliminationEvent.playerName.slice(0, 160),
							createdAt: Number(eliminationEvent.createdAt)
						}
					: null,
			tableMoveEvent:
				tableMoveEvent &&
				typeof tableMoveEvent.id === 'string' &&
				typeof tableMoveEvent.text === 'string'
					? {
							id: tableMoveEvent.id.slice(0, 100),
							text: tableMoveEvent.text.slice(0, 500),
							createdAt: Number(tableMoveEvent.createdAt) || Date.now()
						}
					: null,
			announcementEvent:
				announcementEvent &&
				typeof announcementEvent.id === 'string' &&
				typeof announcementEvent.text === 'string'
					? {
							id: announcementEvent.id.slice(0, 100),
							text: announcementEvent.text.slice(0, 500),
							createdAt: Number(announcementEvent.createdAt) || Date.now()
						}
					: null,
			tableNames: existing?.tableNames && typeof existing.tableNames === 'object' && !Array.isArray(existing.tableNames)
				? existing.tableNames
				: {},
			venueName: String(existing?.venueName ?? '').slice(0, 160),
			updatedAt: Date.now()
		};
		await fs.mkdir(DATA_DIR, { recursive: true });
		await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
		return json({ ok: true, updatedAt: s.updatedAt });
		});
	} catch (e) {
		console.error('Tournament save failed:', e);
		return json({ ok: false, error: 'Unable to save tournament data.' }, { status: 500 });
	}
}


/**
 * Apply an explicit timer command. Timer state is mutated only on the server;
 * ordinary tournament PUTs remain responsible for player/settings data.
 */
export async function POST({ params, request }) {
	if (!valid(params.venueid)) return json({ error: 'Invalid venue ID.' }, { status: 400 });
	try {
		const body = await request.json();
		const action = String(body?.action ?? '');
		return await withVenueWriteLock(params.venueid, async () => {
			const s = await read(params.venueid);
			if (action === 'eliminatePlayer' || action === 'restorePlayer') {
				if (!s || !Array.isArray(s.players)) return json({ error: 'Tournament has not been configured.' }, { status: 404 });
				const playerId = Number(body.playerId);
				if (!Number.isInteger(playerId) || playerId <= 0) return json({ error: 'Invalid player ID.' }, { status: 400 });
				const player = s.players.find((/** @type {any} */ item) => Number(item.id) === playerId);
				if (!player) return json({ error: 'Player not found.' }, { status: 404 });
				// Rebuild unpublished local league results from the authoritative finishing order.
				const recalculateRedtoothResults = () => {
					const pointsForPlace = (place) => ({ 1: 100, 2: 80, 3: 70, 4: 60, 5: 50, 6: 40, 7: 30, 8: 20 })[place] ?? 10;
					const eliminated = s.players.filter((/** @type {any} */ item) => item.eliminated)
						.sort((a, b) => Number(a.eliminationPosition ?? 999999) - Number(b.eliminationPosition ?? 999999));
					const results = new Map();
					for (const item of eliminated) {
						if (item.guest || item.redtoothId == null) continue;
						results.set(Number(item.redtoothId), Math.max(0, pointsForPlace(Number(item.eliminationPosition)) - 10));
					}
					for (const item of s.players) {
						const previousPending = Math.max(0, Number(item.redtoothPendingPoints) || 0);
						const confirmed = Math.max(0, (Number(item.redtoothPoints) || 0) - previousPending);
						const pending = item.guest || item.redtoothId == null ? 0 : (results.get(Number(item.redtoothId)) ?? 0);
						item.redtoothPendingPoints = pending;
						item.redtoothPoints = confirmed + pending;
					}
					if (Array.isArray(s.redtoothPlayers)) {
						s.redtoothPlayers = s.redtoothPlayers.map((/** @type {any} */ row) => {
							const pending = results.get(Number(row.redtoothId)) ?? 0;
							return { ...row, localGames: results.has(Number(row.redtoothId)) ? 1 : 0, localPoints: pending, pendingPoints: pending, qualification: results.has(Number(row.redtoothId)) ? null : (row.qualification ?? null) };
						});
					}
				};
				if (action === 'eliminatePlayer') {
					if (player.eliminated) return json({ error: 'Player is already eliminated.' }, { status: 409 });
					const finishPlace = s.players.filter((/** @type {any} */ item) => !item.eliminated).length;
					player.eliminated = true;
					player.eliminationPosition = finishPlace;
					s.eliminationEvent = { id: `${Date.now()}-${player.id}`, playerName: String(player.name).slice(0, 160), createdAt: Date.now() };
				} else {
					if (!player.eliminated) return json({ error: 'Player is not eliminated.' }, { status: 409 });
					const restoredPosition = Number(player.eliminationPosition);
					player.eliminated = false;
					player.eliminationPosition = null;
					for (const other of s.players) {
						if (other.eliminated && Number.isFinite(restoredPosition) && Number(other.eliminationPosition) > restoredPosition) other.eliminationPosition -= 1;
					}
				}
				recalculateRedtoothResults();
				s.updatedAt = Date.now();
				await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
				return json({ ok: true, player, players: s.players, redtoothPlayers: s.redtoothPlayers ?? [], eliminationEvent: s.eliminationEvent ?? null, updatedAt: s.updatedAt });
			}
			if (action === 'addPlayer') {
				if (!s || !Array.isArray(s.players)) return json({ error: 'Tournament has not been configured.' }, { status: 404 });
				if (s.players.length >= 500) return json({ error: 'Player limit reached.' }, { status: 409 });
				if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 160)
					return json({ error: 'Invalid player name.' }, { status: 400 });
				const name = body.name.trim();
				if (s.players.some((/** @type {any} */ player) => player.name.trim().toLowerCase() === name.toLowerCase()))
					return json({ error: 'A player with that name already exists.' }, { status: 409 });
				const redtoothId = body.redtoothId == null ? null : Number(body.redtoothId);
				if (redtoothId !== null && (!Number.isInteger(redtoothId) || redtoothId <= 0 || redtoothId > 1000000000))
					return json({ error: 'Invalid league player ID.' }, { status: 400 });
				if (redtoothId !== null && s.players.some((/** @type {any} */ player) => Number(player.redtoothId) === redtoothId))
					return json({ error: 'That league player is already entered.' }, { status: 409 });
				const active = s.players.filter((/** @type {any} */ player) => !player.eliminated && Number(player.table) > 0);
				const tableCounts = new Map();
				for (const player of active) tableCounts.set(Number(player.table), (tableCounts.get(Number(player.table)) || 0) + 1);
				const tableIds = [...tableCounts.keys()].sort((x, y) => x - y);
				const table = tableIds.length
					? tableIds.sort((x, y) => tableCounts.get(x) - tableCounts.get(y) || x - y)[0]
					: 1;
				const occupied = new Set(active.filter((/** @type {any} */ player) => Number(player.table) === table).map((/** @type {any} */ player) => Number(player.seat)));
				let seat = 1;
				while (occupied.has(seat) && seat <= 8) seat += 1;
				if (seat > 8) return json({ error: 'No available seat. Rebalance tables first.' }, { status: 409 });
				const id = Math.max(1, Number(s.nextPlayerId) || 1, ...s.players.map((/** @type {any} */ player) => Number(player.id) + 1));
				const player = {
					id, name, table, seat, buyIns: 1, rebuys: 0, topUps: 0, paid: false,
					eliminated: false, eliminationPosition: null, redtoothId,
					redtoothGames: Math.max(0, Number(body.redtoothGames) || 0),
					redtoothPoints: Math.max(0, Number(body.redtoothPoints) || 0),
					redtoothConfirmed: redtoothId !== null, redtoothPendingPoints: 0,
					guest: Boolean(body.guest)
				};
				s.players.push(player);
				s.nextPlayerId = id + 1;
				s.updatedAt = Date.now();
				await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
				return json({ ok: true, player, nextPlayerId: s.nextPlayerId, updatedAt: s.updatedAt });
			}
			if (action === 'deletePlayer') {
				if (!s || !Array.isArray(s.players)) return json({ error: 'Tournament has not been configured.' }, { status: 404 });
				const playerId = Number(body.playerId);
				if (!Number.isInteger(playerId) || playerId <= 0) return json({ error: 'Invalid player ID.' }, { status: 400 });
				const player = s.players.find((/** @type {any} */ item) => Number(item.id) === playerId);
				if (!player) return json({ error: 'Player not found.' }, { status: 404 });
				if (player.eliminated) return json({ error: 'Eliminated players cannot be deleted.' }, { status: 409 });
				s.players = s.players.filter((/** @type {any} */ item) => Number(item.id) !== playerId);
				// Compact remaining active seats without moving players between tables.
				const remainingActive = s.players.filter((/** @type {any} */ item) => !item.eliminated);
				const tableIds = [...new Set(remainingActive.map((/** @type {any} */ item) => Number(item.table)).filter((/** @type {number} */ table) => Number.isInteger(table) && table > 0))].sort((a, b) => a - b);
				for (const table of tableIds) {
					const seated = remainingActive.filter((/** @type {any} */ item) => Number(item.table) === table).sort((a, b) => Number(a.seat) - Number(b.seat));
					seated.forEach((/** @type {any} */ item, index) => { item.seat = index + 1; });
				}
				s.updatedAt = Date.now();
				await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
				return json({ ok: true, players: s.players, updatedAt: s.updatedAt });
			}
			if (action === 'setPlayerPaid' || action === 'renamePlayer' || action === 'adjustPlayerEntry') {
				if (!s || !Array.isArray(s.players)) return json({ error: 'Tournament has not been configured.' }, { status: 404 });
				const playerId = Number(body.playerId);
				if (!Number.isInteger(playerId) || playerId <= 0) return json({ error: 'Invalid player ID.' }, { status: 400 });
				const player = s.players.find((/** @type {any} */ p) => Number(p.id) === playerId);
				if (!player) return json({ error: 'Player not found.' }, { status: 404 });
				if (action === 'setPlayerPaid') {
					if (typeof body.paid !== 'boolean') return json({ error: 'Invalid paid status.' }, { status: 400 });
					player.paid = body.paid;
				} else if (action === 'renamePlayer') {
					if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 160)
						return json({ error: 'Invalid player name.' }, { status: 400 });
					player.name = body.name.trim();
				} else {
					const field = body.field;
					if (field !== 'rebuys' && field !== 'topUps') return json({ error: 'Invalid entry type.' }, { status: 400 });
					const delta = Number(body.delta);
					if (delta !== 1 && delta !== -1) return json({ error: 'Invalid entry adjustment.' }, { status: 400 });
					if (player.eliminated && delta > 0) return json({ error: 'Eliminated players cannot add entries.' }, { status: 409 });
					const nextValue = Number(player[field] || 0) + delta;
					if (!Number.isInteger(nextValue) || nextValue < 0 || nextValue > 1000)
						return json({ error: 'Entry count is out of range.' }, { status: 409 });
					player[field] = nextValue;
				}
				s.updatedAt = Date.now();
				await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
				return json({ ok: true, player, updatedAt: s.updatedAt });
			}
			if (action === 'reorderElimination') {
				if (!s || !Array.isArray(s.players)) return json({ error: 'Tournament has not been configured.' }, { status: 404 });
				const playerId = Number(body.playerId), direction = Number(body.direction);
				if (!Number.isInteger(playerId) || playerId <= 0 || (direction !== -1 && direction !== 1))
					return json({ error: 'Invalid elimination reorder request.' }, { status: 400 });
				const eliminated = s.players.filter((/** @type {any} */ player) => player.eliminated)
					.sort((x, y) => Number(x.eliminationPosition ?? 999999) - Number(y.eliminationPosition ?? 999999));
				const currentIndex = eliminated.findIndex((/** @type {any} */ player) => Number(player.id) === playerId);
				const nextIndex = currentIndex + direction;
				if (currentIndex < 0) return json({ error: 'Eliminated player not found.' }, { status: 404 });
				if (nextIndex < 0 || nextIndex >= eliminated.length) return json({ error: 'Player is already at that end of the finishing order.' }, { status: 409 });
				[eliminated[currentIndex], eliminated[nextIndex]] = [eliminated[nextIndex], eliminated[currentIndex]];
				const activeCount = s.players.filter((/** @type {any} */ player) => !player.eliminated).length;
				for (let index = 0; index < eliminated.length; index++) eliminated[index].eliminationPosition = activeCount + index + 1;
				const pointsForPlace = (place) => ({ 1: 100, 2: 80, 3: 70, 4: 60, 5: 50, 6: 40, 7: 30, 8: 20 })[place] ?? 10;
				const pendingByRedtoothId = new Map(eliminated.filter((/** @type {any} */ player) => !player.guest && player.redtoothId != null)
					.map((/** @type {any} */ player) => [Number(player.redtoothId), Math.max(0, pointsForPlace(Number(player.eliminationPosition)) - 10)]));
				for (const player of s.players) {
					const previousPending = Math.max(0, Number(player.redtoothPendingPoints) || 0);
					const confirmed = Math.max(0, (Number(player.redtoothPoints) || 0) - previousPending);
					const pending = player.guest || player.redtoothId == null ? 0 : (pendingByRedtoothId.get(Number(player.redtoothId)) ?? 0);
					player.redtoothPendingPoints = pending;
					player.redtoothPoints = confirmed + pending;
				}
				if (Array.isArray(s.redtoothPlayers)) s.redtoothPlayers = s.redtoothPlayers.map((/** @type {any} */ row) => {
					const pending = pendingByRedtoothId.get(Number(row.redtoothId)) ?? 0;
					return { ...row, localGames: pendingByRedtoothId.has(Number(row.redtoothId)) ? 1 : 0, localPoints: pending, pendingPoints: pending };
				});
				s.updatedAt = Date.now();
				await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
				return json({ ok: true, players: s.players, redtoothPlayers: s.redtoothPlayers ?? [], updatedAt: s.updatedAt });
			}
			if (['randomiseSeats', 'applyTableBalance', 'replaceEliminatedSeat', 'renameTable'].includes(action)) {
				if (!s || !Array.isArray(s.players)) return json({ error: 'Tournament has not been configured.' }, { status: 404 });
				const active = s.players.filter((/** @type {any} */ player) => !player.eliminated);
				if (action === 'randomiseSeats') {
					if (!active.length) return json({ error: 'There are no active players to seat.' }, { status: 409 });
					for (let i = active.length - 1; i > 0; i--) {
						const j = Math.floor(Math.random() * (i + 1));
						[active[i], active[j]] = [active[j], active[i]];
					}
					const tableCount = Math.ceil(active.length / 8);
					const base = Math.floor(active.length / tableCount);
					const extra = active.length % tableCount;
					let offset = 0;
					for (let table = 1; table <= tableCount; table++) {
						const count = base + (table <= extra ? 1 : 0);
						for (let seat = 1; seat <= count; seat++) {
							active[offset].table = table;
							active[offset].seat = seat;
							offset++;
						}
					}
				} else if (action === 'replaceEliminatedSeat') {
					const eliminatedId = Number(body.eliminatedPlayerId);
					const replacementId = Number(body.replacementPlayerId);
					const eliminated = s.players.find((/** @type {any} */ player) => Number(player.id) === eliminatedId && player.eliminated);
					const replacement = s.players.find((/** @type {any} */ player) => Number(player.id) === replacementId && !player.eliminated);
					if (!eliminated || !replacement) return json({ error: 'Invalid player selection.' }, { status: 400 });
					const table = Number(eliminated.table), seat = Number(eliminated.seat);
					if (!Number.isInteger(table) || table < 1 || !Number.isInteger(seat) || seat < 1 || seat > 8 || replacement.table === table)
						return json({ error: 'That seat cannot be replaced.' }, { status: 409 });
					for (const player of s.players) {
						if (player.eliminated && Number(player.table) === table && Number(player.seat) === seat) {
							player.table = 0; player.seat = 0;
						}
					}
					replacement.table = table; replacement.seat = seat;
					const now = Date.now();
					s.tableMoveEvent = { id: `move-${now}-${replacement.id}`, text: `${replacement.name}, please move to position ${seat} on table ${table}`, createdAt: now };
				} else if (action === 'applyTableBalance') {
					if (!Array.isArray(body.moves) || body.moves.length > 100) return json({ error: 'Invalid table moves.' }, { status: 400 });
					const moves = body.moves;
					const ids = new Set();
					const destinations = new Set();
					for (const move of moves) {
						const id = Number(move?.id), from = Number(move?.from), to = Number(move?.to), seat = Number(move?.seat);
						const player = active.find((/** @type {any} */ item) => Number(item.id) === id);
						const key = `${to}:${seat}`;
						if (!player || ids.has(id) || !Number.isInteger(from) || from < 1 || !Number.isInteger(to) || to < 1 || to > 1000 || !Number.isInteger(seat) || seat < 1 || seat > 8 || Number(player.table) !== from || destinations.has(key))
							return json({ error: 'Table balance is out of date. Refresh and try again.' }, { status: 409 });
						ids.add(id); destinations.add(key);
					}
					for (const move of moves) {
						const player = active.find((/** @type {any} */ item) => Number(item.id) === Number(move.id));
						player.table = Number(move.to); player.seat = Number(move.seat);
						for (const eliminated of s.players) {
							if (eliminated.eliminated && Number(eliminated.table) === player.table && Number(eliminated.seat) === player.seat) {
								eliminated.table = 0; eliminated.seat = 0;
							}
						}
					}
					if (body.mode === 'merge') {
						const closed = new Set(moves.map((/** @type {any} */ move) => Number(move.from)));
						for (const table of closed) {
							if (!active.some((/** @type {any} */ player) => Number(player.table) === table && Number(player.seat) > 0)) {
								for (const player of s.players) if (Number(player.table) === table) { player.table = 0; player.seat = 0; }
							}
						}
					}
					if (moves.length) {
						const now = Date.now();
						s.tableMoveEvent = { id: `table-move-${now}`, text: moves.map((move) => {
							const player = active.find((/** @type {any} */ item) => Number(item.id) === Number(move.id));
							return `${player?.name ?? 'Player'}, please move to position ${Number(move.seat)} on table ${Number(move.to)}`;
						}).join('. '), createdAt: now };
					}
				} else {
					const table = Number(body.tableNumber);
					const name = String(body.name ?? '').trim().slice(0, 32);
					if (!Number.isInteger(table) || table < 1 || table > 1000) return json({ error: 'Invalid table number.' }, { status: 400 });
					s.tableNames = s.tableNames && typeof s.tableNames === 'object' ? s.tableNames : {};
					if (!name || name === `Table ${table}`) delete s.tableNames[table];
					else s.tableNames[table] = name;
				}
				s.updatedAt = Date.now();
				await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
				return json({ ok: true, players: s.players, tableNames: s.tableNames ?? {}, tableMoveEvent: s.tableMoveEvent ?? null, updatedAt: s.updatedAt });
			}
			if (action === 'clearPlayers') {
				if (!s || !Array.isArray(s.players)) return json({ error: 'Tournament has not been configured.' }, { status: 404 });
				s.players = [];
				s.nextPlayerId = 1;
				s.eliminationEvent = null;
				s.tableMoveEvent = null;
				s.announcementEvent = null;
				s.updatedAt = Date.now();
				await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
				return json({ ok: true, updatedAt: s.updatedAt });
			}
			if (action === 'saveSettings') {
				if (!s) return json({ error: 'Tournament has not been configured.' }, { status: 404 });
				const settings = body.settings;
				if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return json({ error: 'Invalid tournament settings.' }, { status: 400 });
				if (typeof settings.soundEnabled !== 'boolean' || typeof settings.announcementEnabled !== 'boolean' || typeof settings.mixedGames !== 'boolean') return json({ error: 'Invalid tournament settings.' }, { status: 400 });
				const buyInAmount = Number(settings.buyInAmount);
				const maxRebuys = Number(settings.maxRebuys);
				const maxTopUps = Number(settings.maxTopUps);
				if (!Number.isFinite(buyInAmount) || buyInAmount < 0 || buyInAmount > 100000 || !Number.isInteger(maxRebuys) || maxRebuys < 0 || maxRebuys > 1000 || !Number.isInteger(maxTopUps) || maxTopUps < 0 || maxTopUps > 1000) return json({ error: 'Invalid tournament settings.' }, { status: 400 });
				s.soundEnabled = settings.soundEnabled;
				s.announcementEnabled = settings.announcementEnabled;
				s.buyInAmount = buyInAmount;
				s.maxRebuys = maxRebuys;
				s.maxTopUps = maxTopUps;
				s.mixedGames = settings.mixedGames;
				if (['timer', 'tables', 'setup', 'payouts'].includes(settings.activeTab)) s.activeTab = settings.activeTab;
				if (settings.tableNames && typeof settings.tableNames === 'object' && !Array.isArray(settings.tableNames)) {
					s.tableNames = Object.fromEntries(Object.entries(settings.tableNames).slice(0, 30).map(([key, value]) => [String(Number(key)), String(value ?? '').trim().slice(0, 32)]).filter(([key, value]) => Number(key) > 0 && value));
				}
				if (typeof settings.venueName === 'string') s.venueName = settings.venueName.trim().slice(0, 160);
				s.updatedAt = Date.now();
				await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
				return json({ ok: true, settings: { soundEnabled: s.soundEnabled, announcementEnabled: s.announcementEnabled, buyInAmount: s.buyInAmount, maxRebuys: s.maxRebuys, maxTopUps: s.maxTopUps, mixedGames: s.mixedGames, activeTab: s.activeTab, tableNames: s.tableNames ?? {}, venueName: s.venueName ?? '' }, updatedAt: s.updatedAt });
			}
			if (action === 'saveRedtoothState') {
				if (!s || !Array.isArray(s.players)) return json({ error: 'Tournament has not been configured.' }, { status: 404 });
				if (!Array.isArray(body.players) || body.players.length > 500) return json({ error: 'Invalid Redtooth player state.' }, { status: 400 });
				const seen = new Set();
				for (const item of body.players) {
					const id = Number(item?.id);
					if (!Number.isInteger(id) || id <= 0 || seen.has(id) ||
						(item.redtoothId !== null && (!Number.isInteger(Number(item.redtoothId)) || Number(item.redtoothId) <= 0 || Number(item.redtoothId) > 1000000000)) ||
						!Number.isInteger(Number(item.redtoothGames)) || Number(item.redtoothGames) < 0 || Number(item.redtoothGames) > 1000000 ||
						!Number.isInteger(Number(item.redtoothPoints)) || Number(item.redtoothPoints) < 0 || Number(item.redtoothPoints) > 100000000 ||
						!Number.isInteger(Number(item.redtoothPendingPoints)) || Number(item.redtoothPendingPoints) < 0 || Number(item.redtoothPendingPoints) > 100000000 ||
						typeof item.redtoothConfirmed !== 'boolean') return json({ error: 'Invalid Redtooth player state.' }, { status: 400 });
					seen.add(id);
				}
				const playerById = new Map(s.players.map((/** @type {any} */ player) => [Number(player.id), player]));
				for (const item of body.players) {
					const player = playerById.get(Number(item.id));
					if (!player) continue;
					player.redtoothId = item.redtoothId == null ? null : Number(item.redtoothId);
					player.redtoothGames = Number(item.redtoothGames);
					player.redtoothPoints = Number(item.redtoothPoints);
					player.redtoothPendingPoints = Number(item.redtoothPendingPoints);
					player.redtoothConfirmed = item.redtoothConfirmed;
				}
				if (Array.isArray(body.redtoothPlayers) && body.redtoothPlayers.length <= 5000) {
					const existingRows = new Map((s.redtoothPlayers ?? []).map((/** @type {any} */ row) => [Number(row.redtoothId), row]));
					s.redtoothPlayers = body.redtoothPlayers.map((/** @type {any} */ row) => {
						const redtoothId = Number(row?.redtoothId);
						const existingRow = existingRows.get(redtoothId) ?? {};
						return {
							position: Math.max(1, Math.min(1000000, Number(row.position) || 1)),
						name: String(row.name ?? '').slice(0, 160),
						games: Math.max(0, Math.min(1000000, Number(row.games) || 0)),
						points: Math.max(0, Math.min(100000000, Number(row.points) || 0)),
						redtoothId,
						qualificationMarker: ['regional', 'playoff'].includes(row.qualificationMarker) ? row.qualificationMarker : null,
						qualification: existingRow.qualification ?? (['regional', 'playoff'].includes(row.qualification) ? row.qualification : null),
						localGames: Math.max(0, Math.min(1000000, Number(existingRow.localGames) || 0)),
						localPoints: Math.max(0, Math.min(100000000, Number(existingRow.localPoints) || 0)),
						pendingPoints: Math.max(0, Math.min(100000000, Number(existingRow.pendingPoints) || 0))
						};
					}).filter((/** @type {any} */ row) => Number.isInteger(row.redtoothId) && row.redtoothId > 0);
				}
				s.updatedAt = Date.now();
				await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
				return json({ ok: true, updatedAt: s.updatedAt });
			}
			if (!s || !Array.isArray(s.levels) || !s.levels.length)
				return json({ error: 'Tournament has not been configured.' }, { status: 404 });

			const now = Date.now();
			let level = Math.max(0, Math.min(Number(s.currentLevel) || 0, s.levels.length - 1));
			let remaining = Math.max(0, Number(s.remainingMs) || 0);
			if (s.running) remaining = Math.max(0, remaining - Math.max(0, now - Number(s.updatedAt || now)));

			if (action === 'pause') {
				s.remainingMs = remaining;
				s.running = false;
			} else if (action === 'start') {
				if (!s.running) {
					if (remaining <= 0) remaining = Math.max(1, Number(s.levels[level]?.minutes) || 1) * 60000;
					s.remainingMs = remaining;
					s.running = true;
					s.tournamentStarted = true;
				}
			} else if (action === 'reset') {
				s.running = false;
				s.remainingMs = Math.max(1, Number(s.levels[level]?.minutes) || 1) * 60000;
			} else if (action === 'nextLevel' || action === 'previousLevel' || action === 'selectLevel') {
				if (action === 'nextLevel') level = Math.min(s.levels.length - 1, level + 1);
				if (action === 'previousLevel') level = Math.max(0, level - 1);
				if (action === 'selectLevel') {
					const requested = Number(body.index);
					if (!Number.isInteger(requested) || requested < 0 || requested >= s.levels.length)
						return json({ error: 'Invalid level index.' }, { status: 400 });
					level = requested;
				}
				s.currentLevel = level;
				s.levelDurationMs = Math.max(1, Number(s.levels[level]?.minutes) || 1) * 60000;
				s.remainingMs = s.levelDurationMs;
				if (s.running) s.tournamentStarted = true;
			} else {
				return json({ error: 'Unknown timer action.' }, { status: 400 });
			}

			s.currentLevel = level;
			s.updatedAt = now;
			if (action === 'pause') s.remainingMs = remaining;
			if (action === 'start' && s.running) s.remainingMs = remaining;
			if (level === s.levels.length - 1 && s.remainingMs <= 0) s.running = false;
			await fs.writeFile(file(params.venueid), JSON.stringify(s, null, 2));
			return json({ ok: true, state: s });
		});
	} catch (e) {
		console.error('Timer command failed:', e);
		return json({ ok: false, error: 'Unable to apply timer command.' }, { status: 500 });
	}
}
