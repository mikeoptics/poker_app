import { json } from '@sveltejs/kit';
import { isAdminRequest } from '#lib/server/admin.js';
import { getRedtoothSeason, fetchSeasonTable } from '../../redtooth/+server.js';
import { getAdminVenueById } from '#lib/server/admin-venues.js';

function seasonWeek() {
	const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	const today = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
	return Math.max(1, Math.min(13, Math.floor((today - Date.UTC(2026, 9, 19)) / 604800000) + 1));
}

export async function GET({ params, cookies }) {
	if (!isAdminRequest(cookies)) return json({ ok: false, error: 'Unauthorised.' }, { status: 401 });
	if (!/^\d{1,12}$/.test(params.venueid)) return json({ ok: false, error: 'Invalid venue ID.' }, { status: 400 });
	try {
		const currentSeason = getRedtoothSeason();
		const previousSeason = getRedtoothSeason(new Date(), -1);
		const [currentPlayers, previousPlayers] = await Promise.all([
			fetchSeasonTable(params.venueid, currentSeason.season, currentSeason.yearId),
			fetchSeasonTable(params.venueid, previousSeason.season, previousSeason.yearId)
		]);
		const currentIds = new Set(currentPlayers.map((player) => player.redtoothId).filter((id) => id !== null));
		const previousIds = new Set(previousPlayers.map((player) => player.redtoothId).filter((id) => id !== null));
		const newPlayers = currentPlayers.filter((player) => player.redtoothId !== null && !previousIds.has(player.redtoothId));
		const inactivePlayers = previousPlayers.filter((player) => player.redtoothId !== null && !currentIds.has(player.redtoothId));
		const week = seasonWeek();
		const totalPlayerWeeks = currentPlayers.reduce((sum, player) => sum + player.games, 0);
		const topByAverage = [...currentPlayers].filter((player) => player.games > 0)
			.sort((a, b) => (b.points / b.games) - (a.points / a.games))[0] ?? null;
		return json({
			ok: true,
			venue: getAdminVenueById(params.venueid) ?? { venueId: Number(params.venueid), venueName: `Venue ${params.venueid}`, eventDay: 'Not listed' },
			season: currentSeason,
			previousSeason,
			currentWeek: week,
			averageWeeklyPlayers: Number((totalPlayerWeeks / week).toFixed(1)),
			totalPlayerWeeks,
			newPlayers,
			inactivePlayers,
			topByAverage,
			players: currentPlayers,
			fetchedAt: new Date().toISOString()
		});
	} catch (error) {
		console.error('Admin venue dashboard failed:', error);
		return json({ ok: false, error: error instanceof Error ? error.message : 'Unable to load venue dashboard.' }, { status: 502 });
	}
}
