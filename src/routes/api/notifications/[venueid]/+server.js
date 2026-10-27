import { json } from '@sveltejs/kit';
import { isValidPushEndpoint, isValidPushSubscription, savePushSubscription, removePushSubscription } from '$lib/server/push-notifications';

/** @param {string | number | null | undefined} id */
const valid = (id) => /^\d{1,12}$/.test(String(id ?? ''));

export async function GET({ params }) {
	if (!valid(params.venueid)) return json({ error: 'Invalid venue ID.' }, { status: 400 });
	return json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
}

export async function POST({ params, request }) {
	if (!valid(params.venueid)) return json({ error: 'Invalid venue ID.' }, { status: 400 });
	let subscription;
	try {
		subscription = await request.json();
	} catch {
		return json({ error: 'Request body must contain valid JSON.' }, { status: 400 });
	}
	if (!isValidPushSubscription(subscription)) return json({ error: 'Invalid push subscription.' }, { status: 400 });
	try {
		await savePushSubscription(params.venueid, subscription);
		return json({ ok: true });
	} catch (error) {
		console.error('Push subscription save failed:', error);
		return json({ ok: false, error: 'Unable to save notification subscription.' }, { status: 500 });
	}
}

export async function DELETE({ params, request }) {
	if (!valid(params.venueid)) return json({ error: 'Invalid venue ID.' }, { status: 400 });
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Request body must contain valid JSON.' }, { status: 400 });
	}
	if (!isValidPushEndpoint(body?.endpoint)) return json({ error: 'Invalid push endpoint.' }, { status: 400 });
	try {
		await removePushSubscription(params.venueid, body.endpoint);
		return json({ ok: true });
	} catch (error) {
		console.error('Push subscription removal failed:', error);
		return json({ ok: false, error: 'Unable to remove notification subscription.' }, { status: 500 });
	}
}
