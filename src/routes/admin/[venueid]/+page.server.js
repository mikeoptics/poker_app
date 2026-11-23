import { error, redirect } from '@sveltejs/kit';
import { isAdminConfigured, isAdminRequest } from '#lib/server/admin.js';

export function load({ params, cookies }) {
	if (!isAdminConfigured()) error(503, 'Admin access is not configured.');
	if (!isAdminRequest(cookies)) redirect(303, '/admin/login');
	if (!/^\d{1,12}$/.test(params.venueid)) error(404, 'Venue not found.');
	return { venueId: params.venueid };
}
