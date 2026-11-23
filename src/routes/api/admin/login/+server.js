import { json } from '@sveltejs/kit';
import { isAdminConfigured, loginAdmin, logoutAdmin } from '#lib/server/admin.js';

export async function POST({ request, cookies }) {
	if (!isAdminConfigured()) {
		return json({ ok: false, error: 'Admin access is not configured. Set ADMIN_PASSWORD on the server.' }, { status: 503 });
	}
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Invalid request.' }, { status: 400 });
	}
	if (body?.logout === true) {
		logoutAdmin(cookies);
		return json({ ok: true });
	}
	if (typeof body?.password !== 'string' || !loginAdmin(body.password, cookies)) {
		return json({ ok: false, error: 'Incorrect password.' }, { status: 401 });
	}
	return json({ ok: true });
}
