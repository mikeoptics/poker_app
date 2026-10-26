import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_ROOT = path.resolve('.data');
const LEGACY_DIR = path.join(DATA_ROOT, 'venues');
const DATABASE_PATH = path.join(DATA_ROOT, 'poker.sqlite');

fs.mkdirSync(DATA_ROOT, { recursive: true });

const database = new DatabaseSync(DATABASE_PATH);
database.exec(`
	PRAGMA journal_mode = WAL;
	PRAGMA synchronous = FULL;
	PRAGMA foreign_keys = ON;
	PRAGMA busy_timeout = 5000;
	CREATE TABLE IF NOT EXISTS venues (
		venue_id TEXT PRIMARY KEY,
		state_json TEXT NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE TABLE IF NOT EXISTS schema_migrations (
		migration TEXT PRIMARY KEY,
		applied_at INTEGER NOT NULL
	);
`);

const getVenue = database.prepare('SELECT state_json FROM venues WHERE venue_id = ?');
const insertVenue = database.prepare(
	'INSERT OR IGNORE INTO venues (venue_id, state_json, updated_at) VALUES (?, ?, ?)'
);
const upsertVenue = database.prepare(
	'INSERT INTO venues (venue_id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(venue_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at'
);

/**
 * Import legacy JSON files once. Existing SQLite rows always win, so a stale
 * JSON backup can never overwrite newer live tournament data.
 */
function migrateLegacyVenues() {
	const migration = 'import-legacy-venue-json-v1';
	database.exec('BEGIN IMMEDIATE');
	try {
		// Recheck after acquiring the write lock so two server starts cannot
		// race to apply the same one-time migration.
		if (!database.prepare('SELECT 1 FROM schema_migrations WHERE migration = ?').get(migration)) {
			if (fs.existsSync(LEGACY_DIR)) {
				for (const name of fs.readdirSync(LEGACY_DIR)) {
					const match = /^(\\d{1,12})\\.json$/.exec(name);
					if (!match) continue;
					let state;
					try {
						state = JSON.parse(fs.readFileSync(path.join(LEGACY_DIR, name), 'utf8'));
					} catch (error) {
						console.error(`Unable to read legacy venue file ${name}:`, error);
						continue;
					}
					if (!state || typeof state !== 'object' || Array.isArray(state)) {
						console.error(`Skipping invalid legacy venue file: ${name}`);
						continue;
					}
					insertVenue.run(match[1], JSON.stringify(state), Number(state.updatedAt) || Date.now());
				}
			}
			database.prepare('INSERT INTO schema_migrations (migration, applied_at) VALUES (?, ?)').run(migration, Date.now());
		}
		database.exec('COMMIT');
	} catch (error) {
		database.exec('ROLLBACK');
		throw error;
	}
}

migrateLegacyVenues();

/** @param {string | number} id */
export function readVenue(id) {
	const key = String(id);
	const row = getVenue.get(key);
	if (!row) return null;
	return JSON.parse(row.state_json);
}

/** @param {string | number} id @param {any} state */
export function writeVenue(id, state) {
	const key = String(id);
	const updatedAt = Number(state?.updatedAt) || Date.now();
	upsertVenue.run(key, JSON.stringify(state), updatedAt);
}

/** @returns {string[]} */
export function listVenueIds() {
	return database.prepare('SELECT venue_id FROM venues ORDER BY venue_id').all().map((row) => row.venue_id);
}
