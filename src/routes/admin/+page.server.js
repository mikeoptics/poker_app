import { redirect } from '@sveltejs/kit';
import { isAdminConfigured, isAdminRequest } from '#lib/server/admin.js';

export function load({ cookies }) {
	if (!isAdminConfigured()) return { configured: false };
	if (!isAdminRequest(cookies)) redirect(303, '/admin/login');
	return { configured: true };
}
