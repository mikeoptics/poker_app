import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	VAPID_PUBLIC_KEY: {},
	VAPID_PRIVATE_KEY: {},
	VAPID_SUBJECT: {}
});
