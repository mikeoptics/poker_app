import { createHmac, timingSafeEqual } from 'node:crypto';
import { ADMIN_PASSWORD } from '$app/env/private';

const COOKIE_NAME = 'stacks_admin';
const SESSION_MAX_AGE = 60 * 60 * 12;

function configuredPassword() {
	return ADMIN_PASSWORD ?? '';
}

function sessionToken() {
	const password = configuredPassword();
	return password ? createHmac('sha256', password).update('stacks-admin-session-v1').digest('hex') : '';
}

export function isAdminConfigured() {
	return configuredPassword().length > 0;
}

export function isAdminRequest(cookies) {
	const expected = sessionToken();
	const supplied = cookies.get(COOKIE_NAME) ?? '';
	if (!expected || supplied.length !== expected.length) return false;
	return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

/** @param {string} password @param {import('@sveltejs/kit').Cookies} cookies */
export function loginAdmin(password, cookies) {
	const expected = configuredPassword();
	if (!expected || password.length !== expected.length) return false;
	const valid = timingSafeEqual(Buffer.from(password), Buffer.from(expected));
	if (!valid) return false;
	cookies.set(COOKIE_NAME, sessionToken(), {
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		maxAge: SESSION_MAX_AGE
	});
	return true;
}

/** @param {import('@sveltejs/kit').Cookies} cookies */
export function logoutAdmin(cookies) {
	cookies.delete(COOKIE_NAME, { path: '/' });
}

export const ADMIN_SESSION_MAX_AGE = SESSION_MAX_AGE;
