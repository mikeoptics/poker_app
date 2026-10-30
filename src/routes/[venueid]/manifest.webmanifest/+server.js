export function GET({ params, url }) {
	const venueId = String(params.venueid || '');
	if (!/^\d{1,12}$/.test(venueId)) {
		return new Response('Not found', { status: 404 });
	}
	const requestedVenueName = (url.searchParams.get('name') || '').trim();
	const venueName = /^Venue\s+\d+$/i.test(requestedVenueName) ? '' : requestedVenueName;
	const manifest = {
		id: `/${venueId}/`,
		name: venueName ? `Mike's Poker App · ${venueName}` : "Mike's Poker App",
		short_name: venueName ? venueName.slice(0, 20) : 'Poker',
		description: venueName ? `Poker tournament timer for ${venueName}` : 'Poker tournament timer',
		start_url: venueName ? `/${venueId}/?name=${encodeURIComponent(venueName)}` : `/${venueId}/`,
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
