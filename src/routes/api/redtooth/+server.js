import { json } from '@sveltejs/kit';

const REDTOOTH_VENUE_SEARCH_URL = 'https://www.redtoothpoker.com/venues/find_ajax/';

const REDTOOTH_LEAGUE_URL = 'https://www.redtoothpoker.com/league/GetVenueLeagueTable';

const DEFAULT_VENUE_ID = '2555';

// Redtooth seasons run for 13 weeks (91 days). Season 4, Year 20
// starts on 19 October 2026. Calculate using the UK calendar date so
// the season changes on the correct local date regardless of server timezone.
const SEASON_ANCHOR_DATE = '2026-10-19';
const SEASON_ANCHOR_NUMBER = 4;
const YEAR_ANCHOR_ID = 20;
const DAYS_PER_SEASON = 91;

function getRedtoothSeason(now = new Date()) {
	const dateParts = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/London',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(now);
	const dateValues = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
	const todayUtc = Date.UTC(
		Number(dateValues.year),
		Number(dateValues.month) - 1,
		Number(dateValues.day)
	);
	const [anchorYear, anchorMonth, anchorDay] = SEASON_ANCHOR_DATE.split('-').map(Number);
	const anchorUtc = Date.UTC(anchorYear, anchorMonth - 1, anchorDay);
	const elapsedSeasons = Math.floor((todayUtc - anchorUtc) / (DAYS_PER_SEASON * 24 * 60 * 60 * 1000));
	const cyclePosition = SEASON_ANCHOR_NUMBER - 1 + elapsedSeasons;

	return {
		season: ((cyclePosition % 4) + 4) % 4 + 1,
		yearId: YEAR_ANCHOR_ID + Math.floor(cyclePosition / 4)
	};
}

/**
 * @param {unknown} value
 */
function cleanText(value) {
	return String(value ?? '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/gi, '&')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.trim();
}

/**
 * @param {string} html
 */
function parseLeagueTable(html) {
	const rows = [];
	const rowRegex = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
	let match;

	while ((match = rowRegex.exec(html))) {
		const attributes = match[1] ?? '';
		const rowHtml = match[2] ?? '';

		const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
			cleanText(m[1])
		);

		if (cells.length < 4) continue;

		const position = Number.parseInt(cells[0], 10);
		const games = Number.parseInt(cells[2], 10);
		const points = Number.parseInt(cells[3], 10);

		if (!Number.isFinite(position) || !Number.isFinite(games) || !Number.isFinite(points)) {
			continue;
		}

		const name = cells[1];

		const onclick = attributes.match(/onclick\s*=\s*["']\s*getGraph\s*\(\s*this\s*,\s*(\d+)\s*,/i);

		const redtoothId = onclick ? Number.parseInt(onclick[1], 10) : null;

		const style = attributes.match(/style\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';

		const qualificationMarker = /border-bottom\s*:\s*3px\s+solid\s+red/i.test(style)
			? 'regional'
			: /border-bottom\s*:\s*3px\s+dashed\s+red/i.test(style)
				? 'playoff'
				: null;

		rows.push({
			position,
			name,
			games,
			points,
			redtoothId,
			qualificationMarker
		});
	}

	let regionalBoundary = null;
	let playoffBoundary = null;

	for (const row of rows) {
		if (row.qualificationMarker === 'regional') {
			regionalBoundary = row.position;
		}

		if (row.qualificationMarker === 'playoff') {
			playoffBoundary = row.position;
		}
	}

	return rows.map((row) => ({
		...row,
		qualification:
			regionalBoundary !== null && row.position <= regionalBoundary
				? 'regional'
				: playoffBoundary !== null && row.position <= playoffBoundary
					? 'playoff'
					: null
	}));
}

/**
 * @param {string} query
 */
async function geocodeSearch(query) {
	const url = new URL('https://nominatim.openstreetmap.org/search');

	url.searchParams.set('q', `${query}, United Kingdom`);
	url.searchParams.set('format', 'jsonv2');
	url.searchParams.set('limit', '1');
	url.searchParams.set('countrycodes', 'gb');

	const response = await fetch(url, {
		headers: {
			'User-Agent': 'MixedTournamentTimer/1.0'
		}
	});

	if (!response.ok) {
		throw new Error(`Geocoder returned HTTP ${response.status}`);
	}

	const results = await response.json();

	if (!Array.isArray(results) || results.length === 0) {
		return null;
	}

	const lat = Number(results[0].lat);
	const lng = Number(results[0].lon);

	if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
		return null;
	}

	return {
		lat,
		lng
	};
}

/**
 * @param {string} query
 */
async function findVenues(query) {
	const location = await geocodeSearch(query);

	if (!location) {
		return {
			venues: [],
			location: null
		};
	}

	const response = await fetch(REDTOOTH_VENUE_SEARCH_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			'User-Agent': 'Mozilla/5.0'
		},
		body: new URLSearchParams({
			lat: String(location.lat),
			lng: String(location.lng)
		})
	});

	if (!response.ok) {
		throw new Error(`Redtooth venue search returned HTTP ${response.status}`);
	}

	const data = await response.json();

	if (!Array.isArray(data)) {
		throw new Error('Redtooth returned an invalid venue response.');
	}

	const venues = data
		.slice(1)
		.filter((venue) => venue?.venueid)
		.map((venue) => ({
			venueid: Number(venue.venueid),
			venuename: cleanText(venue.venuename),
			address1: cleanText(venue.venueaddress1),
			address2: cleanText(venue.venueaddress2),
			town: cleanText(venue.venuetown),
			county: cleanText(venue.venuecounty),
			postcode: cleanText(venue.venuepostcode),
			gamenight: cleanText(venue.gamenight),
			distanceMiles: Number(venue.distance_miles),
			active: venue.active,
			lat: Number(venue.lat),
			lng: Number(venue.longi)
		}));

	return {
		venues,
		location
	};
}

/**
 * @param {number|string} venueId
 */
async function getLeagueTable(venueId) {
	const { season, yearId } = getRedtoothSeason();
	const response = await fetch(REDTOOTH_LEAGUE_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			'User-Agent': 'Mozilla/5.0'
		},
		body: new URLSearchParams({
			venueid: String(venueId),
			season: String(season),
			yearid: String(yearId)
		})
	});

	if (!response.ok) {
		throw new Error(`Redtooth returned HTTP ${response.status}`);
	}

	const html = await response.text();
	const players = parseLeagueTable(html);

	return {
		venueId: Number(venueId),
		season,
		yearId,
		players,
		fetchedAt: new Date().toISOString()
	};
}

export async function GET({ url }) {
	try {
		const mode = url.searchParams.get('mode') ?? 'league';

		if (mode === 'venues') {
			const query = url.searchParams.get('query')?.trim() ?? '';

			if (!query) {
				return json(
					{
						ok: false,
						error: 'Please enter a postcode, town or location.'
					},
					{ status: 400 }
				);
			}

			const result = await findVenues(query);

			return json({
				ok: true,
				...result,
				fetchedAt: new Date().toISOString()
			});
		}

		const requestedVenueId = url.searchParams.get('venueId')?.trim() || DEFAULT_VENUE_ID;

		if (!/^\d+$/.test(requestedVenueId)) {
			return json(
				{
					ok: false,
					error: 'Invalid Redtooth venue ID.'
				},
				{ status: 400 }
			);
		}

		const result = await getLeagueTable(requestedVenueId);

		return json({
			ok: true,
			...result
		});
	} catch (error) {
		console.error('Redtooth request failed:', error);

		return json(
			{
				ok: false,
				error: error instanceof Error ? error.message : 'Unable to contact Redtooth.'
			},
			{ status: 502 }
		);
	}
}
