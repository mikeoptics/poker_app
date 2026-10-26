import fs from 'node:fs/promises';
import path from 'node:path';
import webpush from 'web-push';
import { listVenueIds, readVenue } from '$lib/server/database';

const DATA_DIR = path.resolve('.data');
const PUSH_DIR = path.join(DATA_DIR, 'push');
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@miiiike.com';
let schedulerStarted = false;
let vapidReady = false;

function configure() {
	if (vapidReady) return true;
	if (!publicKey || !privateKey) return false;
	webpush.setVapidDetails(subject, publicKey, privateKey);
	vapidReady = true;
	return true;
}

/** @param {string} venueId @param {any} subscription */
export async function savePushSubscription(venueId, subscription) {
	await fs.mkdir(PUSH_DIR, { recursive: true });
	const file = path.join(PUSH_DIR, venueId + '.json');
	let subscriptions = [];
	try { subscriptions = JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
	if (!Array.isArray(subscriptions)) subscriptions = [];
	const endpoint = subscription?.endpoint;
	if (!endpoint || typeof endpoint !== 'string') throw new Error('Invalid push subscription');
	subscriptions = subscriptions.filter(/** @param {any} item */ (item) => item.endpoint !== endpoint);
	subscriptions.push(subscription);
	await fs.writeFile(file, JSON.stringify(subscriptions, null, 2));
	const stateFile = path.join(PUSH_DIR, venueId + '.state.json');
	const current = readVenue(venueId);
	if (current) await fs.writeFile(stateFile, JSON.stringify({ level: Number(current.currentLevel) || 0 }));
}

/** @param {string} venueId @param {string} endpoint */
export async function removePushSubscription(venueId, endpoint) {
	const file = path.join(PUSH_DIR, venueId + '.json');
	try {
		const subscriptions = JSON.parse(await fs.readFile(file, 'utf8'));
		await fs.writeFile(file, JSON.stringify(subscriptions.filter(/** @param {any} item */ (item) => item.endpoint !== endpoint), null, 2));
	} catch {}
}

async function checkVenueFiles() {
	if (!configure()) return;
	for (const venueId of listVenueIds()) {
		const subscriptionsFile = path.join(PUSH_DIR, venueId + '.json');
		try {
			const state = readVenue(venueId);
			if (!state) continue;
			if (!Array.isArray(state.levels) || !state.levels.length) continue;
			const subscriptions = JSON.parse(await fs.readFile(subscriptionsFile, 'utf8'));
			if (!Array.isArray(subscriptions) || !subscriptions.length) continue;
			const cursorFile = path.join(PUSH_DIR, venueId + '.state.json');
			let cursor = { level: Number(state.currentLevel) || 0 };
			try { cursor = JSON.parse(await fs.readFile(cursorFile, 'utf8')); } catch {}
			let index = Math.max(0, Number(state.currentLevel) || 0);
			let remaining = state.running
				? Math.max(0, Number(state.remainingMs) || 0) - Math.max(0, Date.now() - Number(state.updatedAt || Date.now()))
				: Math.max(0, Number(state.remainingMs) || 0);
			while (remaining <= 0 && index < state.levels.length - 1) {
				index += 1;
				remaining += Math.max(1, Number(state.levels[index]?.minutes) || 1) * 60000;
			}
			if (index <= Number(cursor.level ?? -1)) continue;
			let deliveredLevel = Number(cursor.level ?? -1);
			for (let level = deliveredLevel + 1; level <= index; level += 1) {
				const blind = state.levels[level];
				const isBreak = Boolean(blind?.break);
				const game = state.mixedGames ? String(blind?.game ?? '') : '';
				const speechGame = game.replace(/\bPLO5\b/g, 'P L O five').replace(/\bPLO4\b/g, 'P L O four').replace(/\bNLH\b/g, 'N L H');
				const body = isBreak
					? `Break. ${blind.minutes} minutes.`
					: `Next level. ${game ? speechGame + '. ' : ''}Blinds ${blind.sb} ${blind.bb}.`;
				const payload = JSON.stringify({
					title: isBreak ? 'Break time' : 'Blinds increased',
					body,
					tag: `blind-level-${venueId}-${level}`,
					url: `/${venueId}`
				});
				const results = await Promise.allSettled(subscriptions.map((subscription) => webpush.sendNotification(subscription, payload)));
				const expired = results.map((result, i) => result.status === 'rejected' && [404, 410].includes(result.reason?.statusCode) ? subscriptions[i].endpoint : null).filter(Boolean);
				if (expired.length) {
					const active = subscriptions.filter((item) => !expired.includes(item.endpoint));
					await fs.writeFile(subscriptionsFile, JSON.stringify(active, null, 2));
					subscriptions.splice(0, subscriptions.length, ...active);
				}
				const transientFailure = results.some((result) => result.status === 'rejected' && ![404, 410].includes(result.reason?.statusCode));
				if (transientFailure) break;
				deliveredLevel = level;
			}
			await fs.writeFile(cursorFile, JSON.stringify({ level: deliveredLevel }));
		} catch (error) {
			if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) console.error('Blind push check failed for venue', venueId, error);
		}
	}
}

export function startPushScheduler() {
	if (schedulerStarted) return;
	schedulerStarted = true;
	// The server process advances the notification clock independently of the
	// TD's browser tab, so push alerts still fire when the phone is locked.
	setInterval(() => checkVenueFiles().catch((error) => console.error('Push scheduler failed:', error)), 5000);
}
