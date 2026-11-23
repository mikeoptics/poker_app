function getRedtoothSeason(now = new Date()) {
	const dateParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
	const values = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
	const today = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
	const anchor = Date.UTC(2026, 9, 19);
	const elapsed = Math.floor((today - anchor) / (91 * 86400000));
	const cycle = 3 + elapsed;
	return { season: ((cycle % 4) + 4) % 4 + 1, yearId: 20 + Math.floor(cycle / 4) };
}

const LEAGUE_URL = 'https://www.redtoothpoker.com/league/GetVenueLeagueTable';
const MAX_VENUE_ID = 100000;
const BATCH_SIZE = 8;
const CONSECUTIVE_FAILURE_LIMIT = 1;
const CACHE_TTL = 15 * 60 * 1000;

let scan = {
	status: 'idle',
	venues: [],
	checked: 0,
	nextId: 1,
	lastError: '',
	startedAt: null,
	completedAt: null,
	currentWeek: 1,
	season: null,
	yearId: null
};
let scanPromise = null;
let lastScanAt = 0;

function stripHtml(value) {
	return String(value ?? '')
		.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;|&#160;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&quot;/gi, '"')
		.replace(/\s+/g, ' ')
		.trim();
}

function extractField(html, labels) {
	for (const label of labels) {
		const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const patterns = [
			new RegExp('(?:<[^>]*>\\s*)?' + escaped + '\\s*:?[\\s]*<[^>]*>([\\s\\S]*?)<\\/[^>]+>', 'i'),
			new RegExp(escaped + '\\s*:?\\s*([^<|]{2,90})', 'i')
		];
		for (const pattern of patterns) {
			const match = html.match(pattern);
			if (match?.[1]) {
				const value = stripHtml(match[1]);
				if (value && !new RegExp('^(venue|event|poker|game)\\s*(name|night|day)?$', 'i').test(value)) return value;
			}
		}
	}
	return '';
}

function extractVenueName(html) {
	const labelled = extractField(html, ['Venue Name', 'Venue']);
	if (labelled) return labelled;
	const heading = html.match(/<(?:h1|h2|h3)[^>]*>([\s\S]*?)<\/(?:h1|h2|h3)>/i)?.[1];
	if (heading) {
		const value = stripHtml(heading);
		if (value && !/league|table|standings/i.test(value)) return value;
	}
	const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
	return title ? stripHtml(title).replace(/\s*[|·-]\s*(?:Redtooth.*|League.*)$/i, '').trim() : '';
}

function extractEventDay(html) {
	return extractField(html, ['Poker Night', 'Game Night', 'Gamenight', 'Event Day', 'Night']);
}

function extractLatestWeek(html) {
	const text = stripHtml(html);
	const explicit = [
		/(?:last\s+(?:updated|update)|latest\s+(?:update|week)|updated\s+(?:to|through|for))[^.]{0,45}?week\s*(?:no\.?|number)?\s*[:#-]?\s*(\d{1,2})/i,
		/week\s*(?:no\.?|number)?\s*[:#-]?\s*(\d{1,2})\s*(?:of\s*13)?/i
	];
	for (const pattern of explicit) {
		const match = text.match(pattern);
		if (match) {
			const week = Number(match[1]);
			if (week >= 1 && week <= 13) return week;
		}
	}
	return null;
}

function hasLeagueRows(html) {
	return /<tr\b[\s\S]*?<td\b/i.test(html) && /getGraph\s*\(/i.test(html);
}

function parseVenuePage(html, venueId) {
	const venueName = extractVenueName(html);
	const eventDay = extractEventDay(html);
	const latestWeek = extractLatestWeek(html);
	const valid = Boolean(venueName || eventDay || latestWeek !== null || hasLeagueRows(html));
	return { venueId, venueName, eventDay, latestWeek, valid };
}

async function fetchVenue(venueId, season) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 12000);
	try {
		const response = await fetch(LEAGUE_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
				'User-Agent': 'Mozilla/5.0'
			},
			body: new URLSearchParams({
				venueid: String(venueId),
				season: String(season.season),
				yearid: String(season.yearId)
			}),
			signal: controller.signal
		});
		if (!response.ok) return { valid: false, error: `HTTP ${response.status}` };
		const html = await response.text();
		return parseVenuePage(html, venueId);
	} catch (error) {
		return { valid: false, error: error instanceof Error ? error.message : 'Request failed', networkError: true };
	} finally {
		clearTimeout(timeout);
	}
}

function currentSeasonWeek(now = new Date()) {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
	}).formatToParts(now);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	const today = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
	const anchor = Date.UTC(2026, 9, 19);
	return Math.max(1, Math.min(13, Math.floor((today - anchor) / 604800000) + 1));
}

async function runScan() {
	const season = getRedtoothSeason();
	scan = {
		status: 'scanning', venues: [], checked: 0, nextId: 1, lastError: '',
		startedAt: new Date().toISOString(), completedAt: null,
		currentWeek: currentSeasonWeek(), season: season.season, yearId: season.yearId
	};
	let nextId = 1;
	let consecutiveInvalid = 0;
	let stop = false;

	while (nextId <= MAX_VENUE_ID && !stop) {
		const ids = Array.from({ length: BATCH_SIZE }, (_, index) => nextId + index);
		const results = await Promise.all(ids.map((id) => fetchVenue(id, season)));
		for (let index = 0; index < ids.length; index++) {
			const result = results[index];
			scan.checked++;
			scan.nextId = ids[index] + 1;
			if (result.networkError) {
				scan.lastError = `Temporary error checking venue ${ids[index]}: ${result.error}`;
				consecutiveInvalid = 0;
				continue;
			}
			if (result.valid) {
				scan.venues.push({
					venueId: result.venueId,
					venueName: result.venueName || `Venue ${result.venueId}`,
					eventDay: result.eventDay || 'Not listed',
					latestWeek: result.latestWeek,
					currentWeek: scan.currentWeek,
					uploadStatus: result.latestWeek === null ? 'unknown' : result.latestWeek >= scan.currentWeek ? 'current' : 'behind'
				});
				consecutiveInvalid = 0;
			} else {
				consecutiveInvalid++;
				if (consecutiveInvalid >= CONSECUTIVE_FAILURE_LIMIT) {
					stop = true;
					break;
				}
			}
		}
	}
	scan.status = 'complete';
	scan.completedAt = new Date().toISOString();
	lastScanAt = Date.now();
}

export function getAdminVenueScan(force = false) {
	if (force) {
		if (!scanPromise) {
			scanPromise = runScan().catch((error) => {
				scan.status = 'error';
				scan.lastError = error instanceof Error ? error.message : 'Venue scan failed.';
			}).finally(() => { scanPromise = null; });
		}
	} else if (!scanPromise && (scan.status === 'idle' || (scan.status === 'complete' && Date.now() - lastScanAt > CACHE_TTL))) {
		scanPromise = runScan().catch((error) => {
			scan.status = 'error';
			scan.lastError = error instanceof Error ? error.message : 'Venue scan failed.';
		}).finally(() => { scanPromise = null; });
	}
	return { ...scan, scanning: Boolean(scanPromise) };
}

export function getAdminVenueById(venueId) {
	return scan.venues.find((venue) => venue.venueId === Number(venueId)) ?? null;
}
