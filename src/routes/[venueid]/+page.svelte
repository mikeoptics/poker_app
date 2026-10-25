<script>
	import { onMount } from 'svelte';
	import { ClockArrowUp, Settings } from '@lucide/svelte';
	import { page } from '$app/state';
	import Tables from '$lib/components/Tables/Tables.svelte';
	import {
		pointsForPlace,
		searchRedtoothPlayers,
		applyLocalResult,
		projectedRows
	} from '$lib/redtooth.js';

	/** @typedef {{ sb:number; bb:number; minutes:number; game?:string; break?:boolean }} BlindLevel */
	/** @typedef {{
	 * id:number;
	 * name:string;
	 * table:number;
	 * seat:number;
	 * buyIns:number;
	 * rebuys:number;
	 * topUps:number;
	 * paid:boolean;
	 * eliminated:boolean;
	 * eliminationPosition:number|null;
	 * redtoothId:number|null;
	 * redtoothGames:number;
	 * redtoothPoints:number;
	 * redtoothConfirmed:boolean;
	 * redtoothPendingPoints:number;
	 * guest:boolean;
	 * }} Player */

	const venueId = $derived(Number(page.params.venueid));
	let venueName = $state('Selected venue');
	/** @type {ReturnType<typeof setInterval> | null} */
	let syncInterval = null;
	let savingTournament = false;
	let lastSavedSnapshot = '';
	let castStatus = $state('');
	const games = ['NLH', 'PLO5', 'Pineapple', 'PLO4', 'Crazy Pineapple'];
	const seats = [1, 2, 3, 4, 5, 6, 7, 8];
	const finalSeats = [1, 2, 3, 4, 5, 6, 7, 8];

	/** @param {number} id */
	function togglePaid(id) {
		const p = players.find((x) => x.id === id);

		if (p) {
			p.paid = !p.paid;
		}
	}

	/** @type {BlindLevel[]} */
	const defaultLevels = [
		{ sb: 100, bb: 100, minutes: 15, game: 'NLH' },
		{ sb: 100, bb: 200, minutes: 15, game: 'PLO5' },
		{ sb: 100, bb: 300, minutes: 15, game: 'Pineapple' },
		{ sb: 200, bb: 400, minutes: 15, game: 'PLO4' },
		{ sb: 0, bb: 0, minutes: 15, break: true },
		{ sb: 300, bb: 600, minutes: 15, game: 'Crazy Pineapple' },
		{ sb: 400, bb: 800, minutes: 15, game: 'NLH' },
		{ sb: 500, bb: 1000, minutes: 10, game: 'PLO5' },
		{ sb: 600, bb: 1200, minutes: 10, game: 'Pineapple' },
		{ sb: 800, bb: 1600, minutes: 10, game: 'PLO4' },
		{ sb: 0, bb: 0, minutes: 10, break: true },
		{ sb: 1000, bb: 2000, minutes: 7, game: 'Crazy Pineapple' },
		{ sb: 1500, bb: 3000, minutes: 7, game: 'NLH' },
		{ sb: 2000, bb: 4000, minutes: 7, game: 'PLO5' },
		{ sb: 3000, bb: 6000, minutes: 7, game: 'Pineapple' },
		{ sb: 4000, bb: 8000, minutes: 7, game: 'PLO4' },
		{ sb: 5000, bb: 10000, minutes: 7, game: 'Crazy Pineapple' },
		{ sb: 6000, bb: 12000, minutes: 7, game: 'NLH' },
		{ sb: 8000, bb: 16000, minutes: 7, game: 'PLO5' },
		{ sb: 10000, bb: 20000, minutes: 7, game: 'Pineapple' },
		{ sb: 15000, bb: 30000, minutes: 7, game: 'PLO4' },
		{ sb: 20000, bb: 40000, minutes: 7, game: 'Crazy Pineapple' }
	];

	let levels = $state(defaultLevels.map((x) => ({ ...x })));

	/** @type {string[]} */
	const defaultPlayers = [];

	/** @type {Player[]} */
	let players = $state(
		defaultPlayers.map((name, index) => ({
			id: index + 1,
			name,
			table: 0,
			seat: 0,
			buyIns: 1,
			rebuys: 0,
			topUps: 0,
			paid: false,
			eliminated: false,
			eliminationPosition: null,
			redtoothId: null,
			redtoothGames: 0,
			redtoothPoints: 0,
			redtoothConfirmed: false,
			redtoothPendingPoints: 0,
			guest: false
		}))
	);

	let nextPlayerId = defaultPlayers.length + 1;
	let newPlayerName = $state('');
	/**
	 * @typedef {{
	 *   position: number;
	 *   name: string;
	 *   games: number;
	 *   points: number;
	 *   redtoothId: number | null;
	 *   qualificationMarker: 'regional' | 'playoff' | null;
	 *   qualification: 'regional' | 'playoff' | null;
	 *   localGames?: number;
	 *   localPoints?: number;
	 *   pendingPoints?: number;
	 *   confirmedPoints?: number;
	 *   confirmedGames?: number;
	 *   projectedPosition?: number;
	 * }} RedtoothRow
	 */

	// Redtooth league
	/** @type {RedtoothRow[]} */
	let redtoothPlayers = $state([]);
	/** @type {RedtoothRow[]} */
	let redtoothPlayerDirectory = $state([]);

	/** @type {boolean} */
	let redtoothLoading = $state(false);

	/** @type {string} */
	let redtoothError = $state('');

	/** @type {string | null} */
	let redtoothFetchedAt = $state(null);

	// Add-player Redtooth autocomplete
	/** @type {RedtoothRow[]} */
	let redtoothSearchResults = $state([]);

	/** @type {RedtoothRow | null} */
	let redtoothSelectedPlayer = $state(null);

	/** @type {ReturnType<typeof setTimeout> | null} */
	let redtoothSearchTimer = null;

	/** @typedef {{
	 * venueid: number;
	 * venuename: string;
	 * address1: string;
	 * address2: string;
	 * town: string;
	 * county: string;
	 * postcode: string;
	 * gamenight: string;
	 * distanceMiles: number;
	 * active: string;
	 * lat: number;
	 * lng: number;
	 * }} RedtoothVenue */

	/** @type {RedtoothVenue[]} */
	let redtoothVenues = $state([]);

	let redtoothVenueSearch = $state('');
	let redtoothVenueLoading = $state(false);
	let redtoothVenueError = $state('');

	/** @type {ReturnType<typeof setTimeout> | null} */
	let redtoothVenueSearchTimer = null;

	/** @type {{ venueid:number; venuename:string; address1:string; address2:string; town:string; county:string; postcode:string; gamenight:string; distanceMiles:number; active:string; lat:number; lng:number } | null} */
	let redtoothSelectedVenue = $state(null);
	let currentLevel = $state(0);
	let remainingMs = $state(defaultLevels[0].minutes * 60_000);
	let levelStartedAt = $state(0);
	let levelDurationMs = $state(defaultLevels[0].minutes * 60_000);
	let running = $state(false);
	let soundEnabled = $state(true);
	let announcementEnabled = $state(true);
	let notificationStatus = $state('');
	let buyInAmount = $state(5);
	let tournamentStarted = $state(false);
	let mixedGames = $state(false);
	// timer | tables | setup | blindlevels | payouts
	let activeTab = $state('timer');
	/** @type {{ id:string; playerName:string; createdAt:number } | null} */
	let eliminationEvent = $state(null);
	/** @type {{ id:string; text:string; createdAt:number } | null} */
	let announcementEvent = $state(null);
	let balanceMessage = $state('');
	let redtoothShowTournament = $state(false);
	let redtoothTransitionPaused = $state(false);
	/** @type {ReturnType<typeof setTimeout> | null} */
	let redtoothViewTimer = null;

	/** @type {{id:number; name:string; from:number; to:number; seat:number}[]} */
	let balanceSuggestions = $state([]);

	let showClock = $state(false);
	let showSettings = $state(false);
	let maxRebuys = $state(0);
	let maxTopUps = $state(0);
	let clockRemaining = $state(30);
	let clockRunning = $state(false);

	/** @type {ReturnType<typeof setInterval> | null} */
	let clockInterval = null;

	let tournamentMode = $state('paused');

	/** @type {number | null} */
	let frame = null;

	/** @type {ReturnType<typeof setTimeout> | null} */
	let transitionTimer = null;

	// Kokoro TTS
	/** @type {any} */
	let kokoroTTS = null;

	/** @type {Promise<any> | null} */
	let kokoroLoading = null;

	const speechCache = new Map();

	/** @type {HTMLAudioElement | null} */
	let speechAudio = null;

	const activePlayers = $derived(players.filter((p) => !p.eliminated));
	const eliminatedPlayers = $derived(players.filter((p) => p.eliminated));

	const redtoothRegisteredPlayers = $derived(players.filter((p) => p.redtoothId !== null));
	const activePlayerCount = $derived(activePlayers.length);
	const unpaidPlayerCount = $derived(players.filter((p) => !p.paid).length);
	const currentBlinds = $derived(levels[currentLevel]);

	const previousBlinds = $derived(currentLevel > 0 ? levels[currentLevel - 1] : null);
	const nextLevelIndex = $derived(Math.min(currentLevel + 1, levels.length - 1));
	const nextBlinds = $derived(levels[nextLevelIndex]);

	const currentGame = $derived(
		currentBlinds?.break ? 'BREAK' : mixedGames ? (currentBlinds?.game ?? '') : 'POKER'
	);

	const immediateNextIndex = $derived(Math.min(currentLevel + 1, levels.length - 1));

	const nextGame = $derived(
		levels[immediateNextIndex]?.break
			? 'BREAK'
			: mixedGames
				? (levels[immediateNextIndex]?.game ?? '')
				: 'BLINDS'
	);

	const progress = $derived(
		levelDurationMs > 0 ? Math.max(0, Math.min(100, (remainingMs / levelDurationMs) * 100)) : 0
	);

	const displaySeconds = $derived(Math.max(0, Math.ceil(remainingMs / 1000)));

	const formattedTime = $derived(formatTime(displaySeconds));
	const timerCompleted = $derived(currentLevel === levels.length - 1 && displaySeconds === 0 && !running);

	const isFinalTable = $derived(activePlayerCount > 0 && activePlayerCount <= 8);
	const standardTableCount = $derived(activePlayerCount > 0 ? Math.ceil(activePlayerCount / 8) : 0);

	const tableCount = $derived(standardTableCount);
	const redtoothRegionalPlaces = $derived(
		redtoothPlayers.filter((row) => row.qualification === 'regional').length
	);

	const redtoothPlayoffPlaces = $derived(
		redtoothPlayers.filter((row) => row.qualification === 'playoff').length
	);

	const redtoothLeague = $derived(
		projectedRows(redtoothPlayers).map((row) => {
			const projectedPosition = row.projectedPosition ?? 0;

			return {
				...row,
				projectedPosition,
				projectedQualification:
					redtoothRegionalPlaces > 0 && projectedPosition <= redtoothRegionalPlaces
						? 'regional'
						: redtoothPlayoffPlaces > 0 && projectedPosition <= redtoothPlayoffPlaces
							? 'playoff'
							: null
			};
		})
	);

	/**
	 * @param {string} query
	 */
	async function searchRedtoothVenues(query) {
		const value = query.trim();

		if (redtoothVenueSearchTimer !== null) {
			clearTimeout(redtoothVenueSearchTimer);
			redtoothVenueSearchTimer = null;
		}

		if (!value) {
			redtoothVenues = [];
			redtoothVenueError = '';
			return;
		}

		redtoothVenueSearchTimer = setTimeout(async () => {
			redtoothVenueLoading = true;
			redtoothVenueError = '';

			try {
				const response = await fetch(
					`/api/redtooth?mode=venues&query=${encodeURIComponent(value)}`
				);

				const data = await response.json();

				if (!response.ok || !data.ok) {
					throw new Error(data.error || 'Unable to search for Redtooth venues.');
				}

				redtoothVenues = data.venues ?? [];

				if (redtoothVenues.length === 0) {
					redtoothVenueError = 'No Redtooth venues found nearby.';
				}
			} catch (error) {
				console.error('Redtooth venue search failed:', error);

				redtoothVenues = [];
				redtoothVenueError =
					error instanceof Error ? error.message : 'Unable to search for Redtooth venues.';
			} finally {
				redtoothVenueLoading = false;
			}
		}, 350);
	}

	/**
	 * @param {RedtoothVenue} venue
	 */
	function selectRedtoothVenue(venue) {
		redtoothSelectedVenue = venue;

		redtoothVenueSearch = [venue.venuename, venue.address1, venue.town, venue.postcode]
			.filter(Boolean)
			.join(', ');

		redtoothVenues = [];
		redtoothVenueError = '';

		refreshRedtooth();
	}

	const tournamentRedtoothRows = $derived.by(() => {
		const active = players
			.filter((player) => !player.eliminated)
			.sort((a, b) => {
				const aRow = redtoothLeague.find((row) => row.redtoothId === a.redtoothId);
				const bRow = redtoothLeague.find((row) => row.redtoothId === b.redtoothId);

				// Keep the same order as the Redtooth league table.
				if (aRow && bRow) {
					return aRow.projectedPosition - bRow.projectedPosition;
				}

				// Linked players come before unlinked players.
				if (aRow && !bRow) return -1;
				if (!aRow && bRow) return 1;

				// Preserve tournament player order for unlinked players.
				return players.indexOf(a) - players.indexOf(b);
			});

		const eliminated = players
			.filter((player) => player.eliminated)
			.sort((a, b) => (a.eliminationPosition ?? 999) - (b.eliminationPosition ?? 999));

		return [
			...active.map((player, index) => ({
				player,
				row: redtoothLeague.find((redtoothRow) => redtoothRow.redtoothId === player.redtoothId),
				displayPosition: index + 1
			})),
			...eliminated.map((player) => ({
				player,
				row: redtoothLeague.find((redtoothRow) => redtoothRow.redtoothId === player.redtoothId),
				displayPosition: player.eliminationPosition
			}))
		];
	});
	const totalEntries = $derived(
		players.reduce((sum, p) => sum + p.buyIns + p.rebuys + p.topUps, 0)
	);

	const prizePool = $derived(totalEntries * buyInAmount);
	/** @type {HTMLAudioElement | null} */
	let eliminationSound = null;
	/** @type {number | null} */
	let swipedPlayerId = $state(null);
	let playerSwipeStartX = 0;
	let playerSwipeOffset = $state(0);

	/** @param {PointerEvent} event @param {number} playerId */
	function startPlayerSwipe(event, playerId) {
		swipedPlayerId = playerId;
		playerSwipeStartX = event.clientX;
		playerSwipeOffset = 0;
		/** @type {HTMLElement} */ (event.currentTarget).setPointerCapture(event.pointerId);
	}

	/** @param {PointerEvent} event @param {number} playerId */
	function movePlayerSwipe(event, playerId) {
		if (swipedPlayerId !== playerId) return;
		playerSwipeOffset = Math.max(-112, Math.min(112, event.clientX - playerSwipeStartX));
	}

	/** @param {number} playerId */
	function endPlayerSwipe(playerId) {
		if (swipedPlayerId !== playerId) return;
		const swipeDistance = playerSwipeOffset;
		swipedPlayerId = null;
		playerSwipeOffset = 0;

		const player = players.find((item) => item.id === playerId);
		if (!player) return;

		if (swipeDistance <= -82) {
			if (player.eliminated) restorePlayer(playerId);
			else removePlayer(playerId);
		} else if (swipeDistance >= 82) {
			togglePaid(playerId);
		}
	}

	function cancelPlayerSwipe() {
		swipedPlayerId = null;
		playerSwipeOffset = 0;
	}



	const averageStack = $derived(0);

	/**
	 * The payout schedule is expressed as cash amounts for a £5 entry.
	 * The schedule scales proportionally if the entry price is changed.
	 * @param {number} pot
	 */
	function calculatePayouts(pot) {
		const total = Math.max(0, Number(pot) || 0);
		const entrants = totalEntries;
		if (total <= 0 || entrants === 0) return [];

		if (entrants <= 6) {
			return [{ place: 1, amount: total }];
		}

		/** @type {Record<number, number[]>} */
		const schedule = {
			7: [30, 5],
			8: [30, 10],
			9: [30, 10, 5],
			10: [30, 15, 5],
			11: [35, 15, 5],
			12: [40, 15, 5],
			13: [40, 20, 5],
			14: [45, 20, 5],
			15: [50, 20, 5],
			16: [50, 25, 5],
			17: [55, 25, 5],
			18: [60, 25, 5],
			19: [60, 30, 5],
			20: [60, 30, 10],
			21: [65, 30, 10],
			22: [70, 30, 10],
			23: [70, 35, 10],
			24: [75, 35, 10],
			25: [80, 35, 10],
			26: [80, 40, 10],
			27: [85, 40, 10],
			28: [85, 40, 15]
		};
		const base = schedule[Math.min(entrants, 28)] ?? schedule[28];
		const scale = Math.max(0, Number(buyInAmount) || 0) / 5;
		const amounts = base.map((amount) => amount * scale);

		// For fields above 28 entries, add the extra entries to first place.
		if (entrants > 28) amounts[0] += (entrants - 28) * 5 * scale;

		return amounts.map((amount, index) => ({
			place: index + 1,
			amount: Math.round(amount * 100) / 100
		}));
	}

/** @type {{ place: number; amount: number }[]} */
	const payouts = $derived(calculatePayouts(prizePool));

	/** @param {number} seconds */
	function formatTime(seconds) {
		const safe = Math.max(0, Math.floor(seconds));

		return `${String(Math.floor(safe / 60)).padStart(
			2,
			'0'
		)}:${String(safe % 60).padStart(2, '0')}`;
	}

	function now() {
		return typeof performance !== 'undefined' ? performance.now() : Date.now();
	}

	function syncTimer() {
		if (!running) return;

		remainingMs = Math.max(0, levelStartedAt + levelDurationMs - now());

		if (remainingMs <= 0) {
			remainingMs = 0;
			finishLevel();
			return;
		}

		frame = requestAnimationFrame(syncTimer);
	}

	function base64UrlToUint8Array(value) {
		const padding = '='.repeat((4 - (value.length % 4)) % 4);
		const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
		const raw = atob(base64);
		return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
	}

	async function enableBlindNotifications() {
		try {
			if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
				notificationStatus = 'Push notifications are not supported by this browser.';
				return;
			}
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				notificationStatus = 'Notifications are blocked. Allow them in your browser settings.';
				return;
			}
			const keyResponse = await fetch(`/api/notifications/${venueId}`);
			const { publicKey } = await keyResponse.json();
			if (!publicKey) {
				notificationStatus = 'Push notifications need server keys to be configured.';
				return;
			}
			const registration = await navigator.serviceWorker.register('/service-worker.js');
			let subscription = await registration.pushManager.getSubscription();
			if (!subscription) {
				subscription = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: base64UrlToUint8Array(publicKey)
				});
			}
			const response = await fetch(`/api/notifications/${venueId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(subscription)
			});
			if (!response.ok) throw new Error('Unable to register push subscription.');
			notificationStatus = 'Blind alerts enabled on this device.';
		} catch (error) {
			console.error('Unable to enable blind notifications:', error);
			notificationStatus = 'Could not enable notifications. Check browser permission and server setup.';
		}
	}

	function start() {
		if (running || !currentBlinds) return;

		tournamentStarted = true;
		running = true;
		tournamentMode = currentBlinds?.break ? 'break' : 'play';

		levelStartedAt = now() - (levelDurationMs - remainingMs);

		frame = requestAnimationFrame(syncTimer);

		warmNextAnnouncement();
	}

	function pause() {
		running = false;
		tournamentMode = 'paused';

		if (frame !== null) {
			cancelAnimationFrame(frame);
		}

		frame = null;
	}
	function toggleTimer() {
		running ? pause() : start();
	}

	/** @param {number} index */
	function setLevel(index) {
		currentLevel = Math.max(0, Math.min(levels.length - 1, index));

		levelDurationMs = levels[currentLevel].minutes * 60_000;

		remainingMs = levelDurationMs;
	}

	function resetTimer() {
		pause();

		if (transitionTimer !== null) {
			clearTimeout(transitionTimer);
		}

		transitionTimer = null;
		setLevel(currentLevel);
	}

	function finishLevel() {
		pause();
		// Keep the persisted timer marked as running during the short level
		// transition. The server can then advance it and send push alerts even
		// if the phone suspends this tab before the transition timeout fires.
		if (currentLevel < levels.length - 1) running = true;

		if (soundEnabled) playAlarm();

		if (announcementEnabled && currentLevel < levels.length - 1) {
			announceNextLevel();
		}

		transitionTimer = setTimeout(() => {
			transitionTimer = null;

			const next = currentLevel + 1;

			if (next < levels.length) {
				running = false;
				setLevel(next);
				start();
			} else {
				running = false;
			}
		}, 1200);
	}

	function nextLevel() {
		pause();

		if (currentLevel < levels.length - 1) {
			setLevel(currentLevel + 1);
		}
	}

	function previousLevel() {
		pause();

		if (currentLevel > 0) {
			setLevel(currentLevel - 1);
		}
	}

	/** @param {number} index */
	function selectLevel(index) {
		pause();
		setLevel(index);
	}

	/** @param {number} index @param {'sb'|'bb'} field @param {string|number} value */
	function updateBlind(index, field, value) {
		if (levels[index]) {
			levels[index] = {
				...levels[index],
				[field]: Math.max(0, Number(value) || 0)
			};
		}
	}

	/** @param {number} index @param {string|number} value */
	function updateMinutes(index, value) {
		if (!levels[index]) return;

		levels[index] = {
			...levels[index],
			minutes: Math.max(1, Math.min(999, Number(value) || 1))
		};

		if (index === currentLevel && !running) {
			setLevel(currentLevel);
		}
	}

	function addLevel() {
		const p =
			[...levels].reverse().find((level) => !level.break) ??
			defaultLevels[defaultLevels.length - 1];

		levels.push({
			sb: p.bb,
			bb: p.bb * 2,
			minutes: p.minutes,
			game: p.game ?? games[0]
		});
	}

	/** @param {number} afterIndex */
	function addBreak(afterIndex) {
		levels.splice(afterIndex + 1, 0, {
			sb: 0,
			bb: 0,
			minutes: 15,
			break: true
		});

		if (currentLevel > afterIndex) {
			currentLevel += 1;
		}
	}

	function randomiseSeats() {
		const active = players.filter((p) => !p.eliminated).sort(() => Math.random() - 0.5);

		if (active.length === 0) {
			return;
		}

		const tables = Math.ceil(active.length / 8);

		const baseSize = Math.floor(active.length / tables);
		const extraPlayers = active.length % tables;

		const counts = Array.from({ length: tables }, (_, i) => baseSize + (i < extraPlayers ? 1 : 0));

		let offset = 0;

		counts.forEach((count, tableIndex) => {
			for (let seat = 1; seat <= count; seat += 1) {
				const p = active[offset++];

				p.table = tableIndex + 1;
				p.seat = seat;
			}
		});

		balanceSuggestions = [];
		balanceMessage = '';
	}

	/** @param {number} index */
	function removeLevel(index) {
		if (levels.length <= 1) return;

		levels.splice(index, 1);

		if (currentLevel >= levels.length) {
			currentLevel = levels.length - 1;
		}

		setLevel(currentLevel);
	}

	/** @param {number} seat */
	function seatRole(seat) {
		const sb = 2;
		const bb = 3;

		if (seat === 1) return 'BUTTON';
		if (seat === sb) return 'SB';
		if (seat === bb) return 'BB';

		return `SEAT ${seat}`;
	}

	/** @param {number} id */
	function deletePlayer(id) {
		const player = players.find((item) => item.id === id);
		// Undo an elimination first so finishing positions and league points remain valid.
		if (!player || player.eliminated) return;
		players = players.filter((item) => item.id !== id);
		balanceSuggestions = [];
		balanceMessage = '';
		distributeAcrossTables();
		rebalanceTables();
	}

	function addPlayerFromForm() {
		const name = newPlayerName.trim();

		if (!name) return;

		// Prevent adding the same Redtooth player more than once.
		if (
			redtoothSelectedPlayer?.redtoothId !== null &&
			redtoothSelectedPlayer?.redtoothId !== undefined
		) {
			const selectedPlayer = redtoothSelectedPlayer;

			const alreadyAdded = players.some(
				(player) => player.redtoothId === selectedPlayer.redtoothId
			);

			if (alreadyAdded) {
				newPlayerName = '';
				redtoothSearchResults = [];
				redtoothSelectedPlayer = null;
				return;
			}
		}

		// Prevent duplicate manually-entered names.
		const alreadyAddedByName = players.some(
			(player) => player.name.trim().toLowerCase() === name.toLowerCase()
		);

		if (alreadyAddedByName) {
			newPlayerName = '';
			redtoothSearchResults = [];
			redtoothSelectedPlayer = null;
			return;
		}

		addPlayer(name, redtoothSelectedPlayer);

		newPlayerName = '';
		redtoothSearchResults = [];
		redtoothSelectedPlayer = null;
	}

	function distributeAcrossTables() {
		const active = players.filter((p) => !p.eliminated);

		if (active.length === 0) {
			return;
		}

		const tables = Math.ceil(active.length / 8);

		const baseSize = Math.floor(active.length / tables);
		const extraPlayers = active.length % tables;

		const counts = Array.from({ length: tables }, (_, i) => baseSize + (i < extraPlayers ? 1 : 0));

		let offset = 0;

		counts.forEach((count, tableIndex) => {
			for (let seat = 1; seat <= count; seat += 1) {
				const p = active[offset++];

				p.table = tableIndex + 1;
				p.seat = seat;
			}
		});
	}

	/**
	 * @param {string} name
	 * @param {RedtoothRow | null} redtoothPlayer
	 * @param {boolean} guest
	 */
	function addPlayer(name, redtoothPlayer = null, guest = false) {
		const id = nextPlayerId++;
		console.log('ADDING:', name, redtoothPlayer?.redtoothId);
		players.push({
			id,
			name,
			table: 1,
			seat: 1,
			buyIns: 1,
			rebuys: 0,
			topUps: 0,
			paid: false,
			eliminated: false,
			eliminationPosition: null,

			redtoothId: redtoothPlayer?.redtoothId ?? null,
			redtoothGames: redtoothPlayer?.games ?? 0,
			redtoothPoints: redtoothPlayer?.points ?? 0,
			redtoothConfirmed: redtoothPlayer !== null,
			redtoothPendingPoints: 0,

			guest
		});
		console.log('STORED:', players[players.length - 1].redtoothId);
		distributeAcrossTables();

		if (players.length <= 8) {
			rebalanceTables();
		}
	}

	/**
	 * @param {string} query
	 */
	function searchRedtooth(query) {
		const value = query.trim();

		if (redtoothSearchTimer !== null) {
			clearTimeout(redtoothSearchTimer);
		}

		if (!value) {
			redtoothSearchResults = [];
			return;
		}

		redtoothSearchTimer = setTimeout(() => {
			redtoothSearchResults = searchRedtoothPlayers(redtoothPlayerDirectory, value);
		}, 120);
	}
	function startRedtoothViewTimer() {
		if (redtoothViewTimer !== null) {
			clearTimeout(redtoothViewTimer);
			redtoothViewTimer = null;
		}

		if (redtoothTransitionPaused) return;

		redtoothViewTimer = setTimeout(() => {
			redtoothShowTournament = !redtoothShowTournament;
			startRedtoothViewTimer();
		}, 30000);
	}

	function toggleRedtoothPause() {
		redtoothTransitionPaused = !redtoothTransitionPaused;

		if (redtoothTransitionPaused) {
			if (redtoothViewTimer !== null) {
				clearTimeout(redtoothViewTimer);
				redtoothViewTimer = null;
			}
		} else {
			startRedtoothViewTimer();
		}
	}

	function skipRedtoothView() {
		redtoothShowTournament = !redtoothShowTournament;

		if (!redtoothTransitionPaused) {
			startRedtoothViewTimer();
		}
	}

	/**
	 * @param {RedtoothRow} player
	 */
	function selectRedtoothPlayer(player) {
		redtoothSelectedPlayer = player;
		newPlayerName = player.name;
		redtoothSearchResults = [];

		// Selecting an existing Redtooth player immediately adds them.
		addPlayerFromForm();
	}

	/** @param {number} id @param {string} name */
	function updatePlayerName(id, name) {
		const p = players.find((x) => x.id === id);

		if (p) p.name = name;
	}

	/** @param {number} id @param {'rebuys'|'topUps'} field */
	function changeEntry(id, field) {
		const p = players.find((x) => x.id === id);

		if (!p || p.eliminated) return;
		const limit = field === 'rebuys' ? maxRebuys : maxTopUps;
		if (limit > 0 && p[field] < limit) p[field] += 1;
	}

	/** @param {number} id @param {'rebuys'|'topUps'} field */
	function removeEntry(id, field) {
		const p = players.find((x) => x.id === id);

		if (p && p[field] > 0) {
			p[field] -= 1;
		}
	}

	/** @param {number} id */
	function removePlayer(id) {
		const p = players.find((player) => player.id === id);

		if (!p || p.eliminated) return;

		const finishPlace = activePlayerCount;

		if (soundEnabled && eliminationSound) {
			eliminationSound.currentTime = 0;
			eliminationSound.play().catch(() => {});
		}

		/*
		 * Registered Redtooth players get a locally calculated league result.
		 * Guests are deliberately ignored.
		 */
		if (p.redtoothId) {
			const points = Math.max(0, pointsForPlace(finishPlace) - 10);

			p.redtoothPendingPoints += points;

			redtoothPlayers = applyLocalResult(redtoothPlayers, p, finishPlace);
		}

		const eliminatedAt = Date.now();
		eliminationEvent = {
			id: `${Date.now()}-${p.id}`,
			playerName: p.name,
			createdAt: eliminatedAt
		};

		p.eliminationPosition = finishPlace;
		p.eliminated = true;
		p.table = 0;
		p.seat = 0;

		balanceSuggestions = [];
		balanceMessage = '';

		distributeAcrossTables();
		rebalanceTables();

	}

	/** @param {number} playerId @param {number} direction */
	function moveEliminatedPlayer(playerId, direction) {
		const eliminated = players
			.filter((player) => player.eliminated)
			.sort((a, b) => (a.eliminationPosition ?? 999) - (b.eliminationPosition ?? 999));

		const currentIndex = eliminated.findIndex((player) => player.id === playerId);

		if (currentIndex === -1) return;

		const newIndex = currentIndex + direction;

		if (newIndex < 0 || newIndex >= eliminated.length) {
			return;
		}

		/*
		 * Swap the two players in the finishing order.
		 */
		[eliminated[currentIndex], eliminated[newIndex]] = [
			eliminated[newIndex],
			eliminated[currentIndex]
		];

		/*
		 * Reassign finishing positions.
		 */
		// Eliminated players occupy the places below the players still active.
		// Never renumber this group from 1: that would incorrectly award first,
		// second, etc. while those places are still being contested.
		for (let index = 0; index < eliminated.length; index += 1) {
			eliminated[index].eliminationPosition = activePlayerCount + index + 1;
		}

		/*
		 * Recalculate locally pending Redtooth points.
		 *
		 * The confirmed server total is preserved. Only the unpublished
		 * tournament result is changed.
		 */
		for (const player of eliminated) {
			if (player.guest || player.redtoothId === null) {
				continue;
			}

			if (player.eliminationPosition === null) {
				continue;
			}
			const previousPending = player.redtoothPendingPoints ?? 0;
			const confirmedPoints = (player.redtoothPoints ?? 0) - previousPending;

			const newPoints = Math.max(0, pointsForPlace(player.eliminationPosition) - 10);

			player.redtoothPendingPoints = newPoints;
			player.redtoothPoints = confirmedPoints + newPoints;

			redtoothPlayers = redtoothPlayers.map((row) =>
				row.redtoothId === player.redtoothId
					? {
							...row,
							localGames: 1,
							localPoints: newPoints,
							pendingPoints: newPoints
						}
					: row
			);
		}
	}

	function rebalanceTables() {
		balanceSuggestions = [];
		balanceMessage = '';

		const active = players.filter((p) => !p.eliminated);

		if (active.length === 0) {
			return;
		}

		const tables = Math.ceil(active.length / 8);

		// One table = final table.
		if (tables === 1) {
			const ordered = [...active].sort((a, b) => a.table - b.table || a.seat - b.seat);

			ordered.forEach((p, index) => {
				p.table = 1;
				p.seat = finalSeats[index];
			});

			return;
		}

		// Work out the ideal 8-max distribution.
		const baseSize = Math.floor(active.length / tables);
		const extraPlayers = active.length % tables;

		const targetCounts = Array.from(
			{ length: tables },
			(_, i) => baseSize + (i < extraPlayers ? 1 : 0)
		);

		const currentCounts = Array.from(
			{ length: tables },
			(_, i) => active.filter((p) => p.table === i + 1).length
		);

		// Already balanced.
		const alreadyBalanced = currentCounts.every((count, index) => count === targetCounts[index]);

		if (alreadyBalanced) {
			return;
		}

		// Build a working copy so we can generate movement suggestions.
		const workingCounts = [...currentCounts];

		for (let pass = 0; pass < active.length; pass += 1) {
			let fromTable = -1;
			let toTable = -1;

			for (let i = 0; i < tables; i += 1) {
				if (workingCounts[i] > targetCounts[i] && fromTable === -1) {
					fromTable = i + 1;
				}

				if (workingCounts[i] < targetCounts[i] && toTable === -1) {
					toTable = i + 1;
				}
			}

			if (fromTable === -1 || toTable === -1) {
				break;
			}

			const candidate = active.find(
				(p) => p.table === fromTable && !balanceSuggestions.some((move) => move.id === p.id)
			);

			if (!candidate) {
				break;
			}

			const targetSeat =
				seats.find(
					(seat) =>
						!active.some((p) => p.table === toTable && p.seat === seat) &&
						!balanceSuggestions.some((move) => move.to === toTable && move.seat === seat)
				) ?? 1;

			balanceSuggestions.push({
				id: candidate.id,
				name: candidate.name,
				from: fromTable,
				to: toTable,
				seat: targetSeat
			});

			workingCounts[fromTable - 1] -= 1;
			workingCounts[toTable - 1] += 1;
		}

		if (balanceSuggestions.length) {
			balanceMessage = 'Table balance required — move the following player(s):';
		}
	}

	function applyBalance() {
		for (const move of balanceSuggestions) {
			const p = players.find((x) => x.id === move.id);

			if (p) {
				p.table = move.to;
				p.seat = move.seat;
			}
		}

		balanceSuggestions = [];

		balanceMessage = 'Tables balanced — no table differs by more than one player.';
	}

	function playAlarm() {
		try {
			const AudioContextClass = window.AudioContext;

			if (!AudioContextClass) return;

			const context = new AudioContextClass();
			const nowTime = context.currentTime;

			[0, 0.3, 0.6, 0.9].forEach((offset, i) => {
				const oscillator = context.createOscillator();

				const gain = context.createGain();

				oscillator.type = 'square';
				oscillator.frequency.value = i % 2 ? 1047 : 880;

				gain.gain.setValueAtTime(0.0001, nowTime + offset);

				gain.gain.exponentialRampToValueAtTime(0.4, nowTime + offset + 0.015);

				gain.gain.exponentialRampToValueAtTime(0.0001, nowTime + offset + 0.23);

				oscillator.connect(gain);
				gain.connect(context.destination);

				oscillator.start(nowTime + offset);

				oscillator.stop(nowTime + offset + 0.24);
			});

			setTimeout(() => context.close(), 1500);
		} catch {}
	}

	/** @param {number} id */
	function restorePlayer(id) {
		const p = players.find((player) => player.id === id);

		if (!p) return;

		/*
		 * If this was a locally recorded Redtooth result, remove it
		 * from the projected league table before restoring the player.
		 */
		if (p.redtoothId && p.eliminationPosition !== null) {
			const points = Math.max(0, pointsForPlace(p.eliminationPosition) - 10);

			p.redtoothPendingPoints = Math.max(0, p.redtoothPendingPoints - points);

			redtoothPlayers = redtoothPlayers.map((row) => {
				if (row.redtoothId !== p.redtoothId) return row;

				return {
					...row,
					localGames: Math.max(0, (row.localGames ?? 0) - 1),
					localPoints: Math.max(0, (row.localPoints ?? 0) - points),
					pendingPoints: Math.max(0, (row.pendingPoints ?? 0) - points)
				};
			});
		}

		const restoredPosition = p.eliminationPosition;
		p.eliminated = false;
		p.eliminationPosition = null;

		// Close the finishing-position gap left by restoring this player.
		for (const remainingPlayer of players) {
			if (
				remainingPlayer.eliminated &&
				restoredPosition !== null &&
				remainingPlayer.eliminationPosition !== null &&
				remainingPlayer.eliminationPosition > restoredPosition
			) {
				remainingPlayer.eliminationPosition -= 1;
			}
		}

		// Recalculate unpublished league points against the corrected positions.
		for (const remainingPlayer of players) {
			if (!remainingPlayer.eliminated || remainingPlayer.guest || remainingPlayer.redtoothId === null) continue;
			const previousPending = remainingPlayer.redtoothPendingPoints ?? 0;
			const confirmedPoints = (remainingPlayer.redtoothPoints ?? 0) - previousPending;
			const newPoints = Math.max(0, pointsForPlace(remainingPlayer.eliminationPosition ?? 1) - 10);
			remainingPlayer.redtoothPendingPoints = newPoints;
			remainingPlayer.redtoothPoints = confirmedPoints + newPoints;
			redtoothPlayers = redtoothPlayers.map((row) =>
				row.redtoothId === remainingPlayer.redtoothId
					? { ...row, localGames: 1, localPoints: newPoints, pendingPoints: newPoints }
					: row
			);
		}

		distributeAcrossTables();
		rebalanceTables();
	}

	/** @param {number} index */
	function announcementTextForLevel(index) {
		const level = levels[index];

		if (!level) return '';

		if (level.break) {
			return `Break. ${level.minutes} minutes.`;
		}

		if (!mixedGames) {
			return `Next level. Blinds ${level.sb} ${level.bb}.`;
		}

		const game = level.game ?? '';

		const speechGame = game
			.replace(/\bPLO5\b/g, 'P L O five')
			.replace(/\bPLO4\b/g, 'P L O four')
			.replace(/\bNLH\b/g, 'N L H');

		return `Next level. ${speechGame}. Blinds ${level.sb} ${level.bb}.`;
	}

	async function getKokoro() {
		if (typeof window === 'undefined') return null;

		if (kokoroTTS) return kokoroTTS;
		if (kokoroLoading) return kokoroLoading;

		kokoroLoading = (async () => {
			try {
				const { KokoroTTS } = await import('kokoro-js');

				const modelId = 'onnx-community/Kokoro-82M-v1.0-ONNX';

				if (navigator.gpu) {
					try {
						kokoroTTS = await KokoroTTS.from_pretrained(modelId, {
							device: 'webgpu',
							dtype: 'fp32'
						});

						return kokoroTTS;
					} catch (webgpuError) {
						console.warn('Kokoro WebGPU unavailable; falling back to WASM:', webgpuError);
					}
				}

				kokoroTTS = await KokoroTTS.from_pretrained(modelId, {
					device: 'wasm',
					dtype: 'q8'
				});

				return kokoroTTS;
			} catch (error) {
				console.error('Kokoro TTS failed to load:', error);

				kokoroLoading = null;

				return null;
			}
		})();

		return kokoroLoading;
	}

	/** @param {string} text */
	async function generateSpeech(text) {
		if (!text) return null;

		if (speechCache.has(text)) {
			return speechCache.get(text);
		}

		const tts = await getKokoro();

		if (!tts) return null;

		try {
			const audio = await tts.generate(text, { voice: 'bm_lewis' });

			const url = URL.createObjectURL(audio.toBlob());

			speechCache.set(text, url);

			return url;
		} catch (error) {
			console.error('Kokoro TTS generation failed:', error);

			return null;
		}
	}

	async function warmNextAnnouncement() {
		if (!announcementEnabled) return;

		const next = currentLevel + 1;

		if (next >= levels.length) {
			return;
		}

		await generateSpeech(announcementTextForLevel(next));
	}

	async function announceNextLevel() {
		if (!announcementEnabled) return;

		const i = Math.min(currentLevel + 1, levels.length - 1);

		const text = announcementTextForLevel(i);

		if (!text) return;

		announcementEvent = { id: `${Date.now()}-${i}`, text, createdAt: Date.now() };

		const url = await generateSpeech(text);

		if (!url) return;

		if (speechAudio) {
			speechAudio.pause();
			speechAudio.currentTime = 0;
		}

		speechAudio = new Audio(url);
		speechAudio.volume = 1;

		try {
			await speechAudio.play();
		} catch (error) {
			console.warn('Kokoro audio playback was blocked by the browser:', error);
		}
	}
	const eliminatedCount = $derived(players.filter((player) => player.eliminated).length);

	function startClock() {
		if (clockRunning) return;

		if (clockRemaining <= 0) {
			clockRemaining = 30;
		}

		showClock = true;
		clockRunning = true;

		clockInterval = setInterval(() => {
			clockRemaining -= 1;

			if (clockRemaining <= 0) {
				clockRemaining = 0;
				stopClock();
				playAlarm();
			}
		}, 1000);
	}

	/**
	 * @param {number} index
	 */
	function addLevelAfter(index) {
		const sourceLevel = levels[index];

		const newLevel = {
			sb: sourceLevel?.sb ?? 100,
			bb: sourceLevel?.bb ?? 200,
			minutes: sourceLevel?.minutes ?? 15,
			game: sourceLevel?.game ?? games[0],
			break: false
		};

		levels.splice(index + 1, 0, newLevel);
		currentLevel = index + 1;
	}

	function stopClock() {
		clockRunning = false;

		if (clockInterval !== null) {
			clearInterval(clockInterval);
		}

		clockInterval = null;
	}

	function closeClock() {
		stopClock();

		showClock = false;
		clockRemaining = 30;
	}

	function resetClock() {
		stopClock();

		clockRemaining = 30;
		showClock = true;
	}

	/** @param {KeyboardEvent} event */
	function handleKeyboard(event) {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
			return;
		}

		if (event.code === 'Space') {
			event.preventDefault();
			toggleTimer();
		} else if (event.key.toLowerCase() === 'c') {
			event.preventDefault();

			showClock ? closeClock() : startClock();
		} else if (event.code === 'ArrowRight') {
			event.preventDefault();
			nextLevel();
		} else if (event.code === 'ArrowLeft') {
			event.preventDefault();
			previousLevel();
		} else if (event.key.toLowerCase() === 'r') {
			event.preventDefault();
			resetTimer();
		}
	}

	async function refreshRedtooth() {
		redtoothLoading = true;
		redtoothError = '';

		try {
			const selectedVenueId = venueId;

			const response = await fetch(`/api/redtooth?venueId=${encodeURIComponent(selectedVenueId)}`);

			if (!response.ok) {
				throw new Error(`Redtooth request failed: HTTP ${response.status}`);
			}

			const data = await response.json();

			if (!data.ok) {
				throw new Error(data.error || 'Unable to load Redtooth league table.');
			}

			/*
			 * Keep locally recorded tournament results before replacing
			 * redtoothPlayers with the fresh server data.
			 */
			const localResults = new Map();

			for (const player of players) {
				if (player.redtoothId !== null && !player.guest && player.redtoothPendingPoints > 0) {
					localResults.set(player.redtoothId, {
						games: player.redtoothGames,
						points: player.redtoothPendingPoints
					});
				}
			}

			/*
			 * Load the fresh confirmed Redtooth table, then re-apply
			 * any results from the current tournament that Redtooth
			 * has not yet published.
			 */
			// New seasons can have no current rows yet. Seed the visible
			// table with last season's player directory at zero points.
			const seasonRows =
				Array.isArray(data.players) && data.players.length > 0
					? data.players
					: (data.playerDirectory ?? []).map((row) => ({
							...row, position: 0, games: 0, points: 0,
							qualification: null, qualificationMarker: null
						}));
			redtoothPlayers = seasonRows.map(
				/** @param {RedtoothRow} row */
				(row) => {
					const local = row.redtoothId !== null ? localResults.get(row.redtoothId) : null;

					return {
						...row,
						localGames: local ? 1 : 0,
						localPoints: local?.points ?? 0,
						pendingPoints: local?.points ?? 0
					};
				}
			);

			redtoothPlayerDirectory = data.playerDirectory ?? redtoothPlayers;

			redtoothFetchedAt = data.fetchedAt;

			/*
			 * Reconcile registered players against the refreshed
			 * Redtooth table.
			 */
			for (const player of players) {
				if (player.redtoothId === null || player.guest) {
					continue;
				}

				const row = redtoothPlayers.find((item) => item.redtoothId === player.redtoothId);

				if (!row) {
					continue;
				}

				const pendingPoints = player.redtoothPendingPoints ?? 0;

				/*
				 * Redtooth's current server total does not include the
				 * local tournament result yet.
				 */
				const previousConfirmedPoints = player.redtoothPoints - pendingPoints;

				const serverHasCaughtUp =
					pendingPoints > 0 && row.points >= previousConfirmedPoints + pendingPoints;

				if (serverHasCaughtUp) {
					player.redtoothPoints = row.points;
					player.redtoothGames = row.games;
					player.redtoothPendingPoints = 0;
					player.redtoothConfirmed = true;

					redtoothPlayers = redtoothPlayers.map((item) =>
						item.redtoothId === player.redtoothId
							? {
									...item,
									localGames: 0,
									localPoints: 0,
									pendingPoints: 0
								}
							: item
					);
				} else {
					/*
					 * Redtooth has not caught up yet. Keep the local
					 * result visible on top of the confirmed server total.
					 */
					player.redtoothConfirmed = true;

					redtoothPlayers = redtoothPlayers.map((item) =>
						item.redtoothId === player.redtoothId
							? {
									...item,
									localGames: pendingPoints > 0 ? 1 : 0,
									localPoints: pendingPoints,
									pendingPoints
								}
							: item
					);
				}
			}
			await saveTournament();
		} catch (error) {
			console.error('Redtooth refresh failed:', error);

			redtoothError =
				error instanceof Error ? error.message : 'Unable to load Redtooth league table.';
		} finally {
			redtoothLoading = false;
		}
	}


	function tournamentSnapshot() {
		return {
			levels, players, nextPlayerId, currentLevel, remainingMs, levelDurationMs, running,
			soundEnabled, announcementEnabled, buyInAmount, mixedGames, activeTab, redtoothPlayers,
			maxRebuys, maxTopUps, tournamentStarted,
			eliminationEvent, announcementEvent, venueName, updatedAt: Date.now()
		};
	}

		const browserSettingsKey = `poker-timer-settings:${venueId}`;

		function saveBrowserSettings() {
			try {
				localStorage.setItem(browserSettingsKey, JSON.stringify({
					levels, soundEnabled, announcementEnabled, buyInAmount, mixedGames, maxRebuys, maxTopUps
				}));
			} catch (error) {
				console.warn('Unable to save browser settings:', error);
			}
		}

		function loadBrowserSettings() {
			try {
				const raw = localStorage.getItem(browserSettingsKey);
				if (!raw) return;
				const saved = JSON.parse(raw);
				if (Array.isArray(saved.levels) && saved.levels.length) levels = saved.levels;
				soundEnabled = saved.soundEnabled ?? soundEnabled;
				announcementEnabled = saved.announcementEnabled ?? announcementEnabled;
				buyInAmount = Number(saved.buyInAmount ?? buyInAmount);
				mixedGames = saved.mixedGames ?? mixedGames;
				maxRebuys = Math.max(0, Number(saved.maxRebuys ?? maxRebuys));
				maxTopUps = Math.max(0, Number(saved.maxTopUps ?? maxTopUps));
				currentLevel = Math.min(currentLevel, levels.length - 1);
				if (!running && levels[currentLevel]) {
					levelDurationMs = levels[currentLevel].minutes * 60_000;
					remainingMs = tournamentStarted
						? Math.min(remainingMs, levelDurationMs)
						: levelDurationMs;
				}
			} catch (error) {
				console.warn('Unable to restore browser settings:', error);
			}
		}

	async function loadTournament() {
		const response = await fetch(`/api/tournament/${venueId}`);
		if (!response.ok) throw new Error('Unable to load this venue tournament.');
		const { state } = await response.json();
		if (!state) { loadBrowserSettings(); return; }
		if (Array.isArray(state.levels) && state.levels.length) levels = state.levels;
		if (Array.isArray(state.players)) players = state.players;
		nextPlayerId = state.nextPlayerId ?? players.reduce((max, player) => Math.max(max, player.id), 0) + 1;
		currentLevel = Math.min(state.currentLevel ?? 0, levels.length - 1);
		levelDurationMs = state.levelDurationMs ?? levels[currentLevel].minutes * 60000;
		remainingMs = state.remainingMs ?? levelDurationMs;
		running = Boolean(state.running);
		soundEnabled = state.soundEnabled ?? true;
		announcementEnabled = state.announcementEnabled ?? true;
		maxRebuys = Math.max(0, Number(state.maxRebuys ?? 0));
		maxTopUps = Math.max(0, Number(state.maxTopUps ?? 0));
		buyInAmount = state.buyInAmount ?? 5;
		tournamentStarted = Boolean(state.tournamentStarted || state.running || players.some((player) => player.eliminated));
		mixedGames = Boolean(state.mixedGames);
		activeTab = state.activeTab ?? 'timer';
		if (Array.isArray(state.redtoothPlayers)) redtoothPlayers = state.redtoothPlayers;
		eliminationEvent = state.eliminationEvent ?? null;
		announcementEvent = state.announcementEvent ?? null;
		venueName = state.venueName || venueName;
		redtoothSelectedVenue = { venueid: venueId, venuename: venueName, address1: '', address2: '', town: '', county: '', postcode: '', gamenight: '', distanceMiles: 0, active: '', lat: 0, lng: 0 };
		levelStartedAt = now() - (levelDurationMs - remainingMs);
		lastSavedSnapshot = JSON.stringify(state);
		loadBrowserSettings();
		if (running) {
			tournamentMode = currentBlinds?.break ? 'break' : 'play';
			frame = requestAnimationFrame(syncTimer);
		}
	}

	async function saveTournament() {
		saveBrowserSettings();
		if (savingTournament) return;
		savingTournament = true;
		try {
			const snapshot = tournamentSnapshot();
			const serialised = JSON.stringify(snapshot);
			if (serialised === lastSavedSnapshot) return;
			const response = await fetch(`/api/tournament/${venueId}`, {
				method: 'PUT', headers: { 'content-type': 'application/json' }, body: serialised
			});
			if (response.ok) lastSavedSnapshot = serialised;
		} catch (error) {
			console.error('Tournament save failed:', error);
		} finally {
			savingTournament = false;
		}
	}

function openDisplay() {
		window.open(`/${venueId}/display`, '_blank', 'noopener,noreferrer');
	}

function startCasting() {
    const receiverId = import.meta.env.VITE_CAST_RECEIVER_APP_ID;
    const namespace = 'urn:x-cast:com.miiiike.poker';

    if (!window.cast?.framework) {
        castStatus = 'Google Cast is unavailable in this browser.';
        return;
    }

    if (!receiverId) {
        castStatus = 'Configure VITE_CAST_RECEIVER_APP_ID.';
        return;
    }

    const context = window.cast.framework.CastContext.getInstance();

    context.setOptions({
        receiverApplicationId: receiverId,
        autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });

    context.requestSession()
        .then(() => {
            const session = context.getCurrentSession();

            if (!session) {
                throw new Error('Cast session was not created.');
            }

            return session.sendMessage(namespace, {
                venueId: String(venueId)
            });
        })
        .then(() => {
            castStatus = 'Connected to TV.';
            console.log('Poker Cast message sent successfully.');
        })
        .catch(/** @param {unknown} error */ (error) => {
            console.error('Chromecast connection failed:', error);
            castStatus = 'Unable to connect to Chromecast.';
        });
}

	function resetTournament() {
		const confirmed = window.confirm(
			'Reset this tournament? This will clear all players and game results, and reset the timer. Your venue settings and Redtooth league standings will be kept.'
		);

		if (!confirmed) return;

		pause();

		if (transitionTimer !== null) {
			clearTimeout(transitionTimer);
			transitionTimer = null;
		}

		if (speechAudio) {
			speechAudio.pause();
			speechAudio.currentTime = 0;
		}

		closeClock();
		players = [];
		tournamentStarted = false;
		nextPlayerId = 1;
		newPlayerName = '';
		redtoothSearchResults = [];
		redtoothSelectedPlayer = null;
		currentLevel = 0;
		setLevel(0);
		tournamentMode = 'paused';
		eliminationEvent = null;
		announcementEvent = null;
		balanceSuggestions = [];
		balanceMessage = '';
		redtoothShowTournament = false;
		activeTab = 'timer';

		// Keep redtoothPlayers intact so the league table remains visible on the TV.
		lastSavedSnapshot = '';
		saveTournament();
	}

	function clearRedtoothSelection() {
		redtoothSelectedPlayer = null;
	}

	function addGuestPlayer() {
		const name = newPlayerName.trim();

		if (!name) return;

		addPlayer(name, null, true);
		newPlayerName = '';
		redtoothSelectedPlayer = null;
		redtoothSearchResults = [];
	}

	onMount(() => {
		eliminationSound = new Audio(
			'https://www.myinstants.com/media/sounds/fortnite-death-sound-not-knockout.mp3'
		);
		eliminationSound.volume = 0.8;
		const query = new URLSearchParams(window.location.search);
		venueName = query.get('name') || `Venue ${venueId}`;
		redtoothSelectedVenue = { venueid: venueId, venuename: venueName, address1: '', address2: '', town: '', county: '', postcode: '', gamenight: '', distanceMiles: 0, active: '', lat: 0, lng: 0 };
		window.__onGCastApiAvailable = (available) => { if (!available) castStatus = 'Google Cast API unavailable.'; };
		const castScript = document.createElement('script');
		castScript.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
		document.head.appendChild(castScript);
		loadTournament()
			.catch((error) => {
				console.error('Tournament load failed:', error);
				loadBrowserSettings();
			})
			.finally(() => refreshRedtooth());
		syncInterval = setInterval(() => {
			if (running) remainingMs = Math.max(0, levelStartedAt + levelDurationMs - now());
			saveTournament();
		}, 1000);
		startRedtoothViewTimer();
		const handleVisibilityChange = async () => {
			if (document.visibilityState === 'visible') {
				// The server derives the correct level from wall-clock time, so
				// the director catches up after the browser has throttled its tab.
				try {
					const response = await fetch(`/api/tournament/${venueId}?public=1`, { cache: 'no-store' });
					const result = await response.json();
					const state = result?.state;
					if (response.ok && result.ok && state) {
						currentLevel = Math.min(Number(state.currentLevel) || 0, levels.length - 1);
						levelDurationMs = Math.max(1, Number(levels[currentLevel]?.minutes) || 1) * 60_000;
						remainingMs = Math.max(0, Number(state.remainingMs) || 0);
						running = Boolean(state.running);
						tournamentStarted = Boolean(state.tournamentStarted);
						levelStartedAt = now() - (levelDurationMs - remainingMs);
						if (frame !== null) cancelAnimationFrame(frame);
						frame = running ? requestAnimationFrame(syncTimer) : null;
						tournamentMode = running ? (currentBlinds?.break ? 'break' : 'play') : 'paused';
					}
				} catch (error) {
					console.warn('Unable to catch up tournament timer:', error);
					if (running) {
						remainingMs = Math.max(0, levelStartedAt + levelDurationMs - now());
						if (remainingMs <= 0) finishLevel();
						else {
							if (frame !== null) cancelAnimationFrame(frame);
							frame = requestAnimationFrame(syncTimer);
						}
					}
				}
			}
			saveTournament();
		};
		window.addEventListener('keydown', handleKeyboard);
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			window.removeEventListener('keydown', handleKeyboard);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			if (syncInterval !== null) clearInterval(syncInterval);
			if (redtoothViewTimer !== null) {
				clearInterval(redtoothViewTimer);
				redtoothViewTimer = null;
			}
			if (frame !== null) {
				cancelAnimationFrame(frame);
			}

			if (transitionTimer !== null) {
				clearTimeout(transitionTimer);
			}

			if (clockInterval !== null) {
				clearInterval(clockInterval);
			}

			if (speechAudio) {
				speechAudio.pause();
				speechAudio.currentTime = 0;
			}

			for (const url of speechCache.values()) {
				URL.revokeObjectURL(url);
			}

			speechCache.clear();
		};
	});
</script>

<svelte:head>
	<title>Poker - {venueName}</title>
	<meta name="description" content="Mixed poker tournament timer, table manager and payouts" />
</svelte:head>

<div
	class="app"
	class:mode-play={running && !currentBlinds?.break}
	class:mode-break={running && currentBlinds?.break}
	class:mode-paused={!running}
>
	<header class="header">
		<div class="header-brand"><span class="header-brand-mark">♠</span><div><strong>{venueName}</strong><span>TOURNAMENT CONTROL</span></div></div>
		<div class="header-actions" aria-label="Tournament actions">
			<button class="sound icon-action" type="button" onclick={startCasting} aria-label="Cast to TV" title="Cast to TV">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 16.1a5.9 5.9 0 0 1 5.9 5.9"/><path d="M2 11a11 11 0 0 1 11 11"/><path d="M2 6a16 16 0 0 1 16 16"/><path d="M22 18V5a2 2 0 0 0-2-2H4"/></svg>
			</button>
			<button class="sound icon-action" type="button" onclick={enableBlindNotifications} aria-label="Enable blind alerts" title="Enable blind alerts">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
			</button>
			<button class="sound icon-action" type="button" onclick={openDisplay} aria-label="Open display" title="Open display">
				<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>
			</button>
			<button class="clock-button icon-action" type="button" onclick={() => (showClock ? closeClock() : startClock())} aria-label="Call the clock" title="Call the clock">
				<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6m17-3 3 3M12 2v3"/></svg>
			</button>
			<button class="sound icon-action" type="button" onclick={() => (showSettings = true)} aria-label="Tournament settings" title="Tournament settings" aria-haspopup="dialog" aria-expanded={showSettings}>
				<Settings size={20} strokeWidth={1.8} />
			</button>
			{#if notificationStatus}<span class="cast-status">{notificationStatus}</span>{/if}
			{#if castStatus}<span class="cast-status">{castStatus}</span>{/if}
		</div>
	</header>

	<nav class="tabs icon-tabs" aria-label="Tournament sections">
		<button class:active={activeTab === 'timer'} type="button" aria-label="Timer" title="Timer" aria-current={activeTab === 'timer' ? 'page' : undefined} onclick={() => (activeTab = 'timer')}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6m-3 0v3"/></svg>
			<span>Timer</span>
		</button>
		<button class:active={activeTab === 'tables'} type="button" aria-label="Seating" title="Seating" aria-current={activeTab === 'tables' ? 'page' : undefined} onclick={() => (activeTab = 'tables')}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
			<span>Seating</span>
		</button>
		<button class:active={activeTab === 'setup'} type="button" aria-label="Players" title="Players" aria-current={activeTab === 'setup' ? 'page' : undefined} onclick={() => (activeTab = 'setup')}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6m3-3h-6"/></svg>
			<span>Players</span>
		</button>
		<button class:active={activeTab === 'blindlevels'} type="button" aria-label="Blind levels" title="Blind levels" aria-current={activeTab === 'blindlevels' ? 'page' : undefined} onclick={() => (activeTab = 'blindlevels')}>
			<ClockArrowUp size={21} strokeWidth={1.8} /><span>Levels</span>
		</button>
		<button class:active={activeTab === 'payouts'} type="button" aria-label="Payouts" title="Payouts" aria-current={activeTab === 'payouts' ? 'page' : undefined} onclick={() => (activeTab = 'payouts')}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h2m8 0h2"/></svg>
			<span>Payouts</span>
		</button>
	</nav>

	<main>
		{#if activeTab === 'timer'}
			<section class="director-dashboard">
				<div class="director-level-bar">
					<button class="level-arrow" aria-label="Previous blind level" onclick={previousLevel} disabled={currentLevel === 0}>◀</button>
					<div class="level-main">
						<div class="timer-state-line">
							<span class="director-eyebrow">LEVEL {currentLevel + 1} OF {levels.length}</span>
							<span class:state-running={running} class:state-completed={timerCompleted} class="timer-state" aria-live="polite">{timerCompleted ? 'COMPLETED' : running ? 'RUNNING' : 'PAUSED'}</span>
						</div>
						<span class="director-clock" aria-label={`Time remaining ${formattedTime}`}>{formattedTime}</span>
						{#if currentBlinds?.break}
							<strong>BREAK</strong>
							<span class="director-blinds">{currentBlinds.minutes} MINUTES</span>
						{:else}
							{#if mixedGames}<strong>{currentBlinds?.game}</strong>{/if}
							<span class="director-blinds">{currentBlinds?.sb} / {currentBlinds?.bb}</span>
						{/if}
						<button class="timer-primary-action" type="button" onclick={toggleTimer} disabled={timerCompleted}>{timerCompleted ? 'TOURNAMENT COMPLETE' : running ? 'PAUSE TIMER' : 'START TIMER'}</button>
					</div>
					<button class="level-arrow" aria-label="Next blind level" onclick={nextLevel} disabled={currentLevel >= levels.length - 1}>▶</button>
				</div>
				<div class="director-progress" role="progressbar" aria-label="Level time remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)}><div
					class:progress-paused={!running}
					class:progress-break={running && currentBlinds?.break}
					class:progress-ending={running && displaySeconds <= 10}
					style={`width:${progress}%`}
				></div></div>
				<div class="director-level-context">
					<span>PREVIOUS: {#if previousBlinds}{previousBlinds.break ? 'BREAK' : `${previousBlinds.sb} / ${previousBlinds.bb}`}{:else}—{/if}</span>
					<span>NEXT: {#if nextBlinds}{nextBlinds.break ? 'BREAK' : `${nextBlinds.sb} / ${nextBlinds.bb}`}{:else}—{/if}</span>
				</div>
				<section class="director-players">
					<div class="director-section-heading">
						<div><h1>Players</h1><p class="players-payment-summary">{activePlayerCount} active <span>·</span> {unpaidPlayerCount} unpaid</p></div>
						<div class="director-player-count" aria-label={`${activePlayerCount} active players`}><strong>{activePlayerCount}</strong><span>ACTIVE</span></div>
					</div>

					{#if activePlayers.length === 0 && eliminatedPlayers.length === 0}
						<div class="director-empty">No players have been added to this tournament yet.</div>
					{:else}
						<div class="director-player-list">
							{#each [...activePlayers, ...[...eliminatedPlayers].sort((a, b) => (a.eliminationPosition ?? 999) - (b.eliminationPosition ?? 999))] as player (player.id)}
								<div
									class="director-player-swipe"
									class:dragging={swipedPlayerId === player.id}
									role="button"
									tabindex="0"
									aria-label={`${player.name}, ${player.paid ? "paid" : "unpaid"}. ${player.eliminated ? "Restore player" : "Eliminate player"}. Press right arrow to toggle payment status.`}
									onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); player.eliminated ? restorePlayer(player.id) : removePlayer(player.id); } else if (event.key === "ArrowRight") { event.preventDefault(); togglePaid(player.id); } }}
									onpointerdown={(event) => startPlayerSwipe(event, player.id)}
									onpointermove={(event) => movePlayerSwipe(event, player.id)}
									onpointerup={() => endPlayerSwipe(player.id)}
									onpointercancel={cancelPlayerSwipe}
								>
									<div class="swipe-payment-reveal"><span>{player.paid ? 'MARK UNPAID' : 'PAID'}</span></div>
									<div class="swipe-trash-reveal"><icon name={player.eliminated ? "undo-2" : "user-round-x"} size="18"></icon><span>{player.eliminated ? 'RESTORE' : 'ELIMINATE'}</span></div>
									<div class="director-player-row" class:is-eliminated={player.eliminated} style:transform={`translateX(${swipedPlayerId === player.id ? playerSwipeOffset : 0}px)`}>
										<div class="director-player-identity">
											<strong>{player.name}</strong>
											{#if player.eliminated}
												<span class="player-finish">{player.eliminationPosition}{player.eliminationPosition === 1 ? 'ST' : player.eliminationPosition === 2 ? 'ND' : player.eliminationPosition === 3 ? 'RD' : 'TH'} PLACE</span>
											{/if}
										</div>
										<span class:paid={player.paid} class="payment-pill" aria-label={player.paid ? 'Paid' : 'Unpaid'}>{player.paid ? 'PAID' : 'UNPAID'}</span>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			</section>
		{:else if activeTab === 'tables'}
			<Tables
				{activePlayerCount}
				{eliminatedPlayers}
				{balanceMessage}
				{balanceSuggestions}
				{activePlayers}
				{tableCount}
				{seatRole}
				{applyBalance}
				{randomiseSeats}
			/>
		{:else if activeTab === 'blindlevels'}
			<section class="levels-card compact-levels">
					<div class="section-heading">
						<div>
							<span class="label">STRUCTURE</span>
							<h2>Blind Levels</h2>
						</div>

						<div class="section-actions">
							<button class="add" onclick={addLevel}> + Add level </button>

							<button class="sound mixed-toggle" onclick={() => (mixedGames = !mixedGames)}>
								{mixedGames ? 'Mixed games: ON' : 'Mixed games: OFF'}
							</button>
						</div>
					</div>

					<div class="table">
						<div class:single-game={!mixedGames} class="table-row table-head">
							<span>Level</span>

							{#if mixedGames}
								<span>Game</span>
							{/if}

							<span>SB</span>
							<span>BB</span>
							<span>Min</span>
							<span></span>
						</div>

						{#each levels as level, index}
							<div
								class:active={index === currentLevel}
								class:break-row={level.break}
								class:no-game-column={!mixedGames}
								class="table-row"
							>
								{#if level.break}
									<button class="level-button" onclick={() => selectLevel(index)}>
										{index + 1}
									</button>

									<strong>BREAK</strong>

									{#if mixedGames}
										<span></span>
										<span></span>
									{:else}
										<span></span>
									{/if}

									<input
										type="number"
										min="1"
										max="999"
										value={level.minutes}
										onchange={(e) => updateMinutes(index, e.currentTarget.value)}
									/>

									<button class="delete" onclick={() => removeLevel(index)}> × </button>
								{:else}
									<button class="level-button" onclick={() => selectLevel(index)}>
										{index + 1}
									</button>

									{#if mixedGames}
										<select
											class="game-select"
											value={level.game}
											onchange={(e) => {
												levels[index] = {
													...levels[index],
													game: e.currentTarget.value
												};
											}}
										>
											{#each games as game}
												<option value={game}>
													{game}
												</option>
											{/each}
										</select>
									{/if}

									<input
										type="number"
										min="100"
										step="100"
										value={level.sb}
										onchange={(e) => updateBlind(index, 'sb', e.currentTarget.value)}
									/>

									<input
										type="number"
										min="100"
										step="100"
										value={level.bb}
										onchange={(e) => updateBlind(index, 'bb', e.currentTarget.value)}
									/>

									<input
										type="number"
										min="1"
										max="999"
										value={level.minutes}
										onchange={(e) => updateMinutes(index, e.currentTarget.value)}
									/>

									<button class="delete" onclick={() => removeLevel(index)}> × </button>
								{/if}
							</div>

							{#if !level.break}
								<div class="level-actions">
									<button class="add-level-after" onclick={() => addLevelAfter(index)}>
										+ Level after Level {index + 1}
									</button>

									<button class="add-break" onclick={() => addBreak(index)}>
										+ Break after Level {index + 1}
									</button>
								</div>
							{/if}
						{/each}
					</div>
				</section>
		{:else if activeTab === 'setup'}
			<section class="players-workspace">
				<div class="players-panel-heading">
					<div>
						<span class="label">TOURNAMENT MANAGEMENT</span>
						<h2>Players</h2>
						<p>Add players, manage entries and track payments.</p>
					</div>
					<div class="players-summary">
						<div><strong>{activePlayerCount}</strong><span>Active</span></div>
						<div><strong>{players.length}</strong><span>Players</span></div>
						<div><strong>{totalEntries}</strong><span>Entries</span></div>
					</div>
				</div>

				<div class="players-add-panel">
					<form class="players-add-form" onsubmit={(e) => { e.preventDefault(); addPlayerFromForm(); }}>
						<label class="redtooth-player-input">
							<span>Player name</span>
							<div class="redtooth-autocomplete">
								<input value={newPlayerName} placeholder="Search Redtooth or enter a name" autocomplete="off" oninput={(e) => { newPlayerName = e.currentTarget.value; redtoothSelectedPlayer = null; searchRedtooth(e.currentTarget.value); }} />
								{#if redtoothSearchResults.length > 0}
									<div class="redtooth-search-results">
										{#each redtoothSearchResults as result}
											<button type="button" class="redtooth-search-result" onclick={() => selectRedtoothPlayer(result)}>
												<span><strong>{result.name}</strong><small>{result.games} games · {result.points} pts</small></span>
												<span class="redtooth-search-position">#{result.position}</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</label>
						<button class="primary add-player-submit" type="submit">+ Add player</button>
					</form>
				</div>

				<div class="players-roster">
					<div class="players-roster-heading">
						<h3>Player list</h3>
					</div>
					{#if players.length === 0}
						<p class="empty players-empty">No players added yet.</p>
					{:else}
						<div class="players-roster-list">
							<div class="players-roster-table-heading">
								<span>Player</span><span>Redtooth status</span><span></span>
							</div>
							{#each players as player (player.id)}
								<div class="players-roster-row">
									{#if player.redtoothId != null}
										<span class="players-name-label" title="Redtooth-linked player">{player.name}</span>
									{:else}
										<input class="players-name-input" aria-label="Player name" value={player.name} title="Edit player name" onchange={(e) => updatePlayerName(player.id, e.currentTarget.value)} />
									{/if}
									<span class="roster-status">
										{#if player.redtoothId != null}<span class="roster-tag tag-linked">Linked</span>{:else if !player.guest}<span class="roster-tag tag-unlinked">Not linked</span>{:else}<span class="roster-tag">Guest</span>{/if}
									</span>
									<button class="tiny delete-player-button" type="button" title="Delete player" onclick={() => deletePlayer(player.id)}>Delete</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</section>
		{:else if activeTab === 'payouts'}
			<section class="payout-card">
				<div class="section-heading">
					<div>
						<span class="label"> MONEY </span>

						<h2>Pot & Payouts</h2>
					</div>

					<div class="pot-total">
						£{prizePool.toLocaleString('en-GB')}
					</div>
				</div>

				<div class="payout-buyin-field">
					<label>
						Entry Cost (£)
						<input type="number" min="5" step="5" bind:value={buyInAmount} />
					</label>
				</div>

				<div class="money-grid">
					<div class="money-stat">
						<span>PLAYERS</span>
						<strong>
							{players.length}
						</strong>
					</div>

					<div class="money-stat">
						<span>ENTRIES</span>
						<strong>
							{totalEntries}
						</strong>
					</div>

				</div>

				<div class="payout-section">
					<div class="section-heading">
						<div>
							<span class="label"> PAYOUT STRUCTURE </span>

							<h3>Automatic payouts</h3>
						</div>

						<span class="total-percent">
							£{payouts.reduce((/** @type {number} */ sum, /** @type {{ place: number; amount: number }} */ p) => sum + p.amount, 0).toLocaleString('en-GB')}
							/ £{prizePool.toLocaleString('en-GB')}
						</span>
					</div>

					{#if payouts.length}
						{#each payouts as payout}
							<div class="payout-row">
								<strong>
									{payout.place}
									{payout.place === 1
										? 'st'
										: payout.place === 2
											? 'nd'
											: payout.place === 3
												? 'rd'
												: 'th'}
								</strong>

								<span></span>
								<span></span>

								<b>
									£{payout.amount.toLocaleString('en-GB')}
								</b>
							</div>
						{/each}
					{:else}
						<p class="empty">Add players to calculate payouts.</p>
					{/if}
				</div>
			</section>
		{/if}
	</main>
	{#if showSettings}
		<div
			class="modal-backdrop settings-backdrop"
			role="presentation"
			onclick={(e) => e.target === e.currentTarget && (showSettings = false)}
		>
			<div class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
				<div class="settings-heading">
					<div>
						<span class="settings-eyebrow">PREFERENCES</span>
						<h2 id="settings-title">Tournament settings</h2>
					</div>
					<button class="modal-close" type="button" aria-label="Close settings" onclick={() => (showSettings = false)}>×</button>
				</div>

				<div class="settings-option">
					<div><strong>Venue</strong><span>{venueName}</span></div>
					<a class="settings-venue-link" href="/">Change venue</a>
				</div>

				<div class="settings-option settings-number-option">
					<div><strong>Maximum rebuys</strong><span>Maximum rebuys allowed per player. Set to 0 to hide rebuys.</span></div>
					<input class="settings-number" type="number" min="0" step="1" aria-label="Maximum rebuys per player" bind:value={maxRebuys} />
				</div>
				<div class="settings-option settings-number-option">
					<div><strong>Maximum top-ups</strong><span>Maximum top-ups allowed per player. Set to 0 to hide top-ups.</span></div>
					<input class="settings-number" type="number" min="0" step="1" aria-label="Maximum top-ups per player" bind:value={maxTopUps} />
				</div>

				<div class="settings-option">
					<div><strong>Alarm sound</strong><span>Play an alarm when a blind level ends</span></div>
					<button class:enabled={soundEnabled} class="settings-switch" type="button" role="switch" aria-label="Alarm sound" aria-checked={soundEnabled} onclick={() => (soundEnabled = !soundEnabled)}><span></span></button>
				</div>
				<div class="settings-option">
					<div><strong>Voice announcements</strong><span>Announce the next level when blinds change</span></div>
					<button class:enabled={announcementEnabled} class="settings-switch" type="button" role="switch" aria-label="Voice announcements" aria-checked={announcementEnabled} onclick={() => (announcementEnabled = !announcementEnabled)}><span></span></button>
				</div>

				<div class="settings-danger">
					<div><strong>Reset tournament</strong><span>Clear players and results and return to level 1</span></div>
					<button class="settings-reset" type="button" onclick={() => { showSettings = false; resetTournament(); }}>Reset</button>
				</div>
			</div>
		</div>
	{/if}

	{#if showClock}
		<div
			class="modal-backdrop"
			role="presentation"
			onclick={(e) => e.target === e.currentTarget && closeClock()}
		>
			<div
				class:strobe={clockRunning && clockRemaining <= 10 && clockRemaining > 0}
				class="clock-modal"
				role="dialog"
				aria-modal="true"
				aria-label="Call the Clock"
				tabindex="-1"
			>
				<button class="modal-close" onclick={closeClock}> × </button>

				<span class="label"> CALL THE CLOCK </span>

				<div class="call-clock-number">
					{clockRemaining}
				</div>

				<p>
					{clockRemaining > 10
						? '30 second decision clock'
						: clockRemaining > 0
							? '10 seconds remaining'
							: 'TIME!'}
				</p>

				<div class="clock-controls">
					<button class="primary" onclick={clockRunning ? stopClock : startClock}>
						{clockRunning ? 'Pause' : clockRemaining === 0 ? 'Start again' : 'Start'}
					</button>

					<button class="secondary" onclick={resetClock}> Reset </button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
:global(*){box-sizing:border-box}
:global(html),:global(body){margin:0;min-height:100%;background:#0d0f11;color:#f4f2ed;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
:global(body){overscroll-behavior:none}
:global(button),:global(input),:global(select){font:inherit}
:global(button){cursor:pointer}
:global(button:focus-visible),:global(input:focus-visible),:global(select:focus-visible){outline:2px solid #d8b66d;outline-offset:3px}
:global(.app){--bg:#0d0f11;--panel:#171a1d;--panel-raised:#202428;--line:#30363b;--ink:#f4f2ed;--muted:#929aa1;--gold:#c7a45e;--red:#b96d70;--green:#79ad8c;display:flex;flex-direction:column;width:100%;height:100dvh;min-height:100dvh;overflow:hidden;padding:env(safe-area-inset-top) 0 0;background:var(--bg);color:var(--ink)}
.header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex:0 0 64px;width:100%;padding:0 28px;border-bottom:1px solid #24292d}
.header-brand{display:flex;align-items:center;gap:11px;min-width:0}.header-brand-mark{display:grid;place-items:center;width:36px;height:36px;border:1px solid #55472d;border-radius:10px;color:var(--gold);font-size:22px}.header-brand div{display:flex;flex-direction:column;gap:3px}.header-brand strong{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;letter-spacing:.01em}.header-brand div span{color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.15em}
.header-actions{display:flex;align-items:center;gap:7px}.icon-action{display:grid;place-items:center;width:40px;height:40px;padding:0;border:1px solid transparent;border-radius:10px;background:transparent;color:#aeb5bc}.icon-action:hover{border-color:var(--line);background:var(--panel);color:var(--ink)}.icon-action svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.cast-status{color:var(--muted);font-size:11px}
main{flex:1;min-height:0;width:100%;overflow:auto;padding:28px clamp(16px,4vw,56px) 36px;overscroll-behavior:contain}
.tabs.icon-tabs{order:10;display:flex;align-items:stretch;justify-content:center;gap:8px;flex:0 0 auto;width:100%;min-height:76px;margin:0;padding:8px 18px max(8px,env(safe-area-inset-bottom));border-top:1px solid #292e33;background:#121518}
.icon-tabs button{display:flex;flex:0 1 112px;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-width:58px;min-height:54px;padding:6px 12px;border:0;border-radius:10px;background:transparent;color:#818991}.icon-tabs button span{font-size:10px;font-weight:650;letter-spacing:.02em}.icon-tabs button svg{width:21px;height:21px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.icon-tabs button.active{background:#242321;color:var(--gold);box-shadow:inset 0 -2px var(--gold)}.icon-tabs button:hover{background:#1d2125;color:var(--ink)}
.director-dashboard{width:100%;max-width:1060px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);grid-template-areas:"timer players" "context players";align-items:start;gap:0 34px}.director-level-bar{grid-area:timer;display:grid;grid-template-columns:42px minmax(0,1fr) 42px;align-items:center;gap:12px}.level-arrow{width:42px;height:48px;border:1px solid var(--line);border-radius:11px;background:var(--panel);color:var(--gold);font-size:16px}.level-arrow:disabled{opacity:.25}.level-main{display:flex;min-width:0;flex-direction:column;align-items:center;gap:13px;padding:30px 26px 25px;border:1px solid #343a40;border-radius:20px;background:linear-gradient(145deg,#1c2024,#15181b);box-shadow:0 20px 55px #0005;text-align:center}.timer-state-line{display:flex;width:100%;align-items:center;justify-content:space-between}.director-eyebrow{color:#aab0b5;font-size:10px;font-weight:800;letter-spacing:.15em}.timer-state{padding:5px 10px;border:1px solid #625438;border-radius:99px;color:#d9bd83;font-size:9px;font-weight:800;letter-spacing:.1em}.timer-state.state-running{border-color:#365a46;color:#9dd1af}.timer-state.state-completed{border-color:#454b51;color:#b0b5bc}.director-clock{color:#faf9f5;font-size:clamp(68px,9vw,112px);font-weight:750;letter-spacing:-.075em;line-height:.98;font-variant-numeric:tabular-nums;white-space:nowrap}.level-main strong{color:#b7b9b8;font-size:11px;letter-spacing:.17em}.director-blinds{color:#e5e1d7;font-size:20px;font-weight:650;font-variant-numeric:tabular-nums}.timer-primary-action{width:100%;min-height:50px;margin-top:8px;border:1px solid var(--gold);border-radius:10px;background:var(--gold);color:#171614;font-size:13px;font-weight:850;letter-spacing:.1em}.timer-primary-action:hover{background:#d7b976}.timer-primary-action:disabled{border-color:#41474c;background:#292e33;color:#aeb5bc;cursor:not-allowed}
.director-progress{height:5px;margin:15px 3px 0;overflow:hidden;border-radius:99px;background:#2a3035}.director-progress>div{height:100%;border-radius:inherit;background:var(--gold);transition:width .3s linear}.director-progress>div.progress-paused{background:#727980}.director-progress>div.progress-break{background:#7e9ca4}.director-progress>div.progress-ending{background:#b96d70}.director-level-context{grid-area:context;display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0 0}.director-level-context span{padding:13px 14px;border:1px solid #292f34;border-radius:10px;background:#14171a;color:#9ca4aa;font-size:10px;font-weight:700;letter-spacing:.05em}.director-level-context span:last-child{text-align:right}
.director-players{grid-area:players;min-width:0;padding:4px 0 20px}.director-section-heading{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px;padding:0 0 16px;border-bottom:1px solid var(--line)}.director-section-heading h1{font-size:26px;font-weight:680;letter-spacing:-.045em}.players-payment-summary{margin:6px 0 0;color:#929aa1;font-size:12px}.director-player-count{display:flex;align-items:center;gap:8px;color:var(--muted)}.director-player-count strong{color:var(--ink);font-size:26px;font-variant-numeric:tabular-nums}.director-player-count span{font-size:9px;font-weight:800;letter-spacing:.1em}.director-player-list{border-top:0}.director-player-swipe{position:relative;overflow:hidden;border-bottom:1px solid #292f34;touch-action:pan-y}.director-player-row{position:relative;z-index:1;display:flex;min-height:66px;align-items:center;justify-content:space-between;gap:12px;padding:10px 5px;background:var(--bg);transition:transform .16s ease}.director-player-identity{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}.director-player-identity strong{overflow:hidden;color:#f1f0eb;font-size:15px;font-weight:620;text-overflow:ellipsis;white-space:nowrap}.player-finish{color:var(--muted);font-size:9px;letter-spacing:.1em}.payment-pill{display:inline-flex;min-width:66px;min-height:27px;align-items:center;justify-content:center;margin-left:auto;padding:4px 9px;border:1px solid #75464a;border-radius:6px;background:#302023;color:#e2a2a5;font-size:9px;font-weight:850;letter-spacing:.08em}.payment-pill.paid{border-color:#365a46;background:#1d2d26;color:#9dd1af}.swipe-payment-reveal,.swipe-trash-reveal{position:absolute;inset:0 auto 0 0;display:flex;width:112px;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:#274333;color:#c4e0cc;font-size:9px;font-weight:800;letter-spacing:.06em}.swipe-trash-reveal{right:0;left:auto;background:#49282b;color:#efb5b7}.director-empty{padding:30px 12px;color:var(--muted);text-align:center}
.label,.settings-eyebrow{display:block;margin-bottom:7px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.14em}.levels-card,.setup-card,.payout-card{width:100%;max-width:1060px;margin:0 auto;padding:24px;border:1px solid var(--line);border-radius:16px;background:var(--panel);color:var(--ink)}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.section-heading h2{font-size:23px;letter-spacing:-.04em}.section-heading h3{font-size:16px}.section-actions{display:flex;flex-wrap:wrap;gap:8px}.sound,.add,.clock-button,.secondary,.tiny,.delete,.level-button,.add-level-after,.add-break{min-height:38px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#202429;color:#d9dce0}.add,.primary,.add-player-submit{border-color:var(--gold);background:var(--gold);color:#171614;font-weight:750}.table{width:100%;overflow-x:auto}.table-row{display:grid;grid-template-columns:60px repeat(5,minmax(48px,1fr));align-items:center;gap:8px;min-width:480px;padding:9px 10px;border-bottom:1px solid var(--line)}.table-head{color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.table-row.active{background:#2a261d}.table-row input,.table-row select,.players-name-input,.redtooth-player-input input,.payout-buyin-field input,.settings-number{width:100%;min-width:0;min-height:38px;padding:7px 9px;border:1px solid #3a4147;border-radius:7px;background:#101316;color:var(--ink)}.level-button,.delete{min-height:32px;padding:4px 8px}.delete,.delete-player-button{color:#d28e91}.level-actions{display:flex;gap:8px;padding:6px 0 12px}.level-actions button{min-height:30px;padding:5px 9px;border:0;background:transparent;color:#b5a16f;font-size:11px}
.players-workspace{display:flex;width:100%;max-width:1000px;flex-direction:column;gap:16px;margin:0 auto}.players-panel-heading,.players-add-panel,.players-roster{padding:20px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}.players-panel-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.players-panel-heading h2{font-size:24px}.players-panel-heading p{margin:5px 0 0;color:var(--muted);font-size:12px}.players-summary{display:flex;gap:8px}.players-summary>div,.money-stat{display:flex;min-width:70px;flex-direction:column;align-items:center;gap:4px;padding:10px;border:1px solid var(--line);border-radius:8px;background:#111417}.players-summary strong,.money-stat strong{font-size:20px;font-variant-numeric:tabular-nums}.players-summary span,.money-stat span{color:var(--muted);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.players-add-form{display:flex;align-items:flex-end;gap:12px}.redtooth-player-input{display:flex;flex:1;flex-direction:column;gap:7px;color:#aeb5bc;font-size:11px}.redtooth-autocomplete{position:relative}.redtooth-search-results{position:absolute;z-index:4;top:calc(100% + 4px);left:0;right:0;overflow:hidden;border:1px solid var(--line);border-radius:9px;background:#202428;box-shadow:0 12px 30px #0008}.redtooth-search-result{display:flex;width:100%;justify-content:space-between;padding:11px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);text-align:left}.redtooth-search-result small{display:block;margin-top:3px;color:var(--muted)}.redtooth-search-position{color:var(--gold)}.add-player-submit{min-height:40px;padding:0 16px;border:0;border-radius:8px}.players-roster-heading{margin-bottom:12px}.players-roster-heading h3{font-size:16px}.players-roster-table-heading,.players-roster-row{display:grid;grid-template-columns:minmax(0,1fr) 130px 72px;align-items:center;gap:12px;padding:11px 8px;border-bottom:1px solid var(--line)}.players-roster-table-heading{color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.roster-status{font-size:11px}.roster-tag{color:var(--muted)}.tag-linked{color:var(--green)}.tag-unlinked{color:#d6ae72}.tiny{min-height:30px;padding:4px 8px}.empty{color:var(--muted);font-size:13px}
.payout-card{max-width:760px}.pot-total{color:var(--gold);font-size:30px;font-weight:750;font-variant-numeric:tabular-nums}.payout-buyin-field{max-width:220px;margin-bottom:18px}.payout-buyin-field label{display:flex;flex-direction:column;gap:7px;color:var(--muted);font-size:11px}.money-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:24px}.money-stat{align-items:flex-start;padding:16px}.money-stat strong{font-size:24px}.payout-section{padding-top:18px;border-top:1px solid var(--line)}.total-percent{color:var(--gold);font-size:12px;font-variant-numeric:tabular-nums}.payout-row{display:grid;grid-template-columns:70px 1fr 1fr auto;align-items:center;gap:12px;padding:14px 8px;border-bottom:1px solid var(--line)}.payout-row strong{color:#c8cbd0}.payout-row b{color:var(--gold);font-size:18px;font-variant-numeric:tabular-nums}
.modal-backdrop{position:fixed;z-index:20;inset:0;display:grid;place-items:center;padding:20px;background:#000b;backdrop-filter:blur(8px)}.settings-modal,.clock-modal{width:min(100%,520px);max-height:min(90dvh,800px);overflow:auto;padding:24px;border:1px solid #3a4147;border-radius:18px;background:#191d20;box-shadow:0 25px 80px #000b}.settings-heading{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px}.settings-heading h2{font-size:22px}.modal-close{width:36px;height:36px;border:1px solid var(--line);border-radius:8px;background:#24292e;color:var(--ink);font-size:22px}.settings-option,.settings-danger{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 0;border-top:1px solid var(--line)}.settings-option>div,.settings-danger>div{display:flex;flex-direction:column;gap:5px}.settings-option strong,.settings-danger strong{font-size:13px}.settings-option span,.settings-danger span{max-width:310px;color:var(--muted);font-size:11px}.settings-number{max-width:85px}.settings-venue-link{color:var(--gold);font-size:12px}.settings-switch{width:44px;height:26px;padding:3px;border:0;border-radius:99px;background:#424950}.settings-switch span{display:block;width:20px;height:20px;border-radius:50%;background:#d5d8da;transition:transform .15s}.settings-switch.enabled{background:#547b60}.settings-switch.enabled span{transform:translateX(18px)}.settings-reset{padding:8px 14px;border:1px solid #75464a;border-radius:8px;background:#302023;color:#e2a2a5}.clock-modal{text-align:center}.call-clock-number{margin:20px 0;color:var(--gold);font-size:clamp(80px,20vw,130px);font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.06em}.clock-modal p{color:var(--muted)}.clock-controls{display:flex;justify-content:center;gap:10px}.clock-controls button{min-width:100px;min-height:42px;border-radius:8px}.primary{border:0;background:var(--gold);color:#171614}.secondary{background:#24292e;color:var(--ink)}.clock-modal.strobe{animation:clock-flash .35s infinite alternate}@keyframes clock-flash{to{background:#51282b}}
@media(max-width:760px){.header{flex-basis:56px;padding:0 14px}.header-brand-mark{width:32px;height:32px}.header-brand strong{max-width:120px;font-size:12px}.header-actions{gap:1px}.icon-action{width:35px;height:38px}main{padding:16px 14px 24px}.director-dashboard{display:flex;flex-direction:column;gap:26px;max-width:560px}.director-level-bar{width:100%;grid-template-columns:34px minmax(0,1fr) 34px;gap:7px}.level-arrow{width:34px;height:44px}.level-main{width:100%;padding:22px 14px 18px;border-radius:16px}.director-clock{font-size:clamp(58px,17vw,84px)}.director-players{width:100%;padding:0}.director-section-heading h1{font-size:23px}.director-player-count{display:none}.director-level-context{width:100%;margin-top:-14px}.tabs.icon-tabs{min-height:68px;gap:1px;padding-left:5px;padding-right:5px}.icon-tabs button{flex:1;min-width:0;padding:5px 1px}.icon-tabs button span{font-size:9px}.levels-card,.setup-card,.payout-card{padding:16px;border-radius:12px}.players-panel-heading{align-items:flex-start;flex-direction:column}.players-summary{width:100%}.players-summary>div{flex:1}.players-add-form{align-items:stretch;flex-direction:column}.add-player-submit{width:100%}.players-roster-table-heading,.players-roster-row{grid-template-columns:minmax(0,1fr) 90px 58px;gap:7px;padding-left:2px;padding-right:2px}.payout-row{grid-template-columns:52px 1fr auto}.payout-row span{display:none}.settings-modal,.clock-modal{padding:18px}}
@media(max-width:360px){.header-brand div span{font-size:8px}.header-brand strong{max-width:88px}.icon-action{width:31px}.director-clock{font-size:clamp(52px,16vw,62px)}.director-level-context span{padding:9px 7px;font-size:9px}.payment-pill{min-width:60px;padding:4px 6px}}
@media(prefers-reduced-motion:reduce){:global(*),:global(*::before),:global(*::after){scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style>
