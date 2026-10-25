import { json } from '@sveltejs/kit';
import { savePushSubscription, removePushSubscription } from '$lib/server/push-notifications';

/** @param {string | number | null | undefined} id */
const valid = (id) => /^\d{1,12}$/.test(String(id ?? ''));

export async function GET({ params }) {
	if (!valid(params.venueid)) return json({ error: 'Invalid venue ID.' }, { status: 400 });
	return json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
}

export async function POST({ params, request }) {
	if (!valid(params.venueid)) return json({ error: 'Invalid venue ID.' }, { status: 400 });
	try {
		const subscription = await request.json();
		await savePushSubscription(params.venueid, subscription);
		return json({ ok: true });
	} catch (error) {
		console.error('Push subscription save failed:', error);
		return json({ ok: false, error: 'Unable to save notification subscription.' }, { status: 500 });
	}
}

export async function DELETE({ params, request }) {
	if (!valid(params.venueid)) return json({ error: 'Invalid venue ID.' }, { status: 400 });
	try {
		const { endpoint } = await request.json();
		await removePushSubscription(params.venueid, endpoint);
		return json({ ok: true });
	} catch (error) {
		return json({ ok: false, error: 'Unable to remove notification subscription.' }, { status: 500 });
	}
}
