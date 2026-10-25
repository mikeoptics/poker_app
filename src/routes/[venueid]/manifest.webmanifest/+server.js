export function GET({ params, url }) {
	const venueId = String(params.venueid || '');
	if (!/^\\d{1,12}$/.test(venueId)) {
		return new Response('Not found', { status: 404 });
	}
	const venueName = (url.searchParams.get('name') || `Venue ${venueId}`).slice(0, 100);
	const manifest = {
		id: `/${venueId}/`,
		name: `Mike's Poker App · ${venueName}`,
		short_name: venueName.slice(0, 20) || 'Poker',
		description: `Poker tournament timer for ${venueName}`,
		start_url: `/${venueId}/?name=${encodeURIComponent(venueName)}`,
		scope: `/${venueId}/`,
		display: 'standalone',
		background_color: '#101214',
		theme_color: '#101214',
		icons: [
			{ src: '/poker-app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
		]
	};
	return new Response(JSON.stringify(manifest), {
		headers: {
			'Content-Type': 'application/manifest+json; charset=utf-8',
			'Cache-Control': 'no-cache'
		}
	});
}
