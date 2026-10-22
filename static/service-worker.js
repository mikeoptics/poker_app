self.addEventListener('push', (event) => {
	let data = {};
	try { data = event.data ? event.data.json() : {}; } catch {}
	event.waitUntil(self.registration.showNotification(data.title || 'Poker tournament', {
		body: data.body || 'The blind level has changed.',
		tag: data.tag || 'poker-blind-alert',
		icon: '/favicon.png',
		badge: '/favicon.png',
		data: { url: data.url || '/' },
		vibrate: [200, 100, 200],
		requireInteraction: true
	}));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
	event.waitUntil((async () => {
		const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
		for (const client of clientsList) {
			if ('focus' in client) {
				await client.navigate(target);
				return client.focus();
			}
		}
		return self.clients.openWindow(target);
	})());
});
