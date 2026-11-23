import { json } from '@sveltejs/kit';
import { isAdminRequest } from '#lib/server/admin.js';
import { getAdminVenueScan } from '#lib/server/admin-venues.js';

export async function GET({ cookies }) {
	if (!isAdminRequest(cookies)) return json({ ok: false, error: 'Unauthorised.' }, { status: 401 });
	return json({ ok: true, ...getAdminVenueScan() });
}

export async function POST({ cookies }) {
	if (!isAdminRequest(cookies)) return json({ ok: false, error: 'Unauthorised.' }, { status: 401 });
	return json({ ok: true, ...getAdminVenueScan(true) });
}
