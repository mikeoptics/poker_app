import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(),
			version: {
				// This app does not need periodic version polling; deployment checks
				// still run through SvelteKit's response headers and navigation events.
				pollInterval: 0
			}
		})
	],

	server: {
		host: true,
		allowedHosts: ['.trycloudflare.com', 'poker.miiiike.com']
	}
});
