import { json } from '@sveltejs/kit';
import { isAdminRequest } from '#lib/server/admin.js';
import { getAdminVenueById } from '#lib/server/admin-venues.js';

const LEAGUE_URL = 'https://www.redtoothpoker.com/league/GetVenueLeagueTable';

function getSeason(offset = 0) {
	const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	const today = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
	const elapsed = Math.floor((today - Date.UTC(2026, 9, 19)) / (91 * 86400000)) + offset;
	const cycle = 3 + elapsed;
	return { season: ((cycle % 4) + 4) % 4 + 1, yearId: 20 + Math.floor(cycle / 4) };
}

function parseTable(html) {
	const rows = [];
	for (const match of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
		const cells = [...match[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
			cell[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;/g, "'").trim()
		);
		if (cells.length < 4) continue;
		const position = Number.parseInt(cells[0], 10);
		const games = Number.parseInt(cells[2], 10);
		const points = Number.parseInt(cells[3], 10);
		if (!Number.isFinite(position) || !Number.isFinite(games) || !Number.isFinite(points)) continue;
		const onclick = `${match[1]} ${match[2]}`.match(/onclick\s*=\s*["'][^"']*getGraph\s*\(\s*this\s*,\s*(\d+)/i);
		rows.push({ position, name: cells[1], games, points, redtoothId: onclick ? Number.parseInt(onclick[1], 10) : null });
	}
	return rows;
}

async function fetchTable(venueId, season) {
	const response = await fetch(LEAGUE_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'Mozilla/5.0' },
		body: new URLSearchParams({ venueid: String(venueId), season: String(season.season), yearid: String(season.yearId) })
	});
	if (!response.ok) throw new Error(`Redtooth returned HTTP ${response.status}`);
	return parseTable(await response.text());
}

function currentWeek() {
	const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	const today = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
	return Math.max(1, Math.min(13, Math.floor((today - Date.UTC(2026, 9, 19)) / 604800000) + 1));
}

export async function GET({ params, cookies }) {
	if (!isAdminRequest(cookies)) return json({ ok: false, error: 'Unauthorised.' }, { status: 401 });
	if (!/^\d{1,12}$/.test(params.venueid)) return json({ ok: false, error: 'Invalid venue ID.' }, { status: 400 });
	try {
		const currentSeason = getSeason();
		const previousSeason = getSeason(-1);
		const [players, previousPlayers] = await Promise.all([
			fetchTable(params.venueid, currentSeason),
			fetchTable(params.venueid, previousSeason)
		]);
		const currentIds = new Set(players.map((player) => player.redtoothId).filter((id) => id !== null));
		const previousIds = new Set(previousPlayers.map((player) => player.redtoothId).filter((id) => id !== null));
		const newPlayers = players.filter((player) => player.redtoothId !== null && !previousIds.has(player.redtoothId));
		const inactivePlayers = previousPlayers.filter((player) => player.redtoothId !== null && !currentIds.has(player.redtoothId));
		const week = currentWeek();
		const totalPlayerWeeks = players.reduce((sum, player) => sum + player.games, 0);
		const topByAverage = [...players].filter((player) => player.games > 0).sort((a, b) => (b.points / b.games) - (a.points / a.games))[0] ?? null;
		return json({
			ok: true,
			venue: getAdminVenueById(params.venueid) ?? { venueId: Number(params.venueid), venueName: `Venue ${params.venueid}`, eventDay: 'Not listed' },
			season: currentSeason, previousSeason, currentWeek: week,
			averageWeeklyPlayers: Number((totalPlayerWeeks / week).toFixed(1)),
			totalPlayerWeeks, newPlayers, inactivePlayers, topByAverage, players,
			fetchedAt: new Date().toISOString()
		});
	} catch (error) {
		console.error('Admin venue dashboard failed:', error);
		return json({ ok: false, error: error instanceof Error ? error.message : 'Unable to load venue dashboard.' }, { status: 502 });
	}
}
