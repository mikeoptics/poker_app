import { error, redirect } from '@sveltejs/kit';
import { isAdminConfigured, isAdminRequest } from '#lib/server/admin.js';

export function load({ cookies }) {
	if (!isAdminConfigured()) error(503, 'Admin access is not configured. Add ADMIN_PASSWORD to the server environment.');
	if (!isAdminRequest(cookies)) redirect(303, '/admin/login');
	return { configured: true };
}
