<script>
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
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
	let savePending = false;
	let lastSavedSnapshot = '';
	let castStatus = $state('');
	let timerCompact = $state(false);
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
	let installPrompt = $state(null);
	let installStatus = $state('');
	let appInstalled = $state(false);
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
	let balanceAction = $state('move');
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

	const isFinalTable = $derived(activePlayerCount > 0 && activePlayerCount <= 8);
	const tableCount = $derived(Math.max(0, ...players.map((player) => Number(player.table) || 0)));
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
		const seatedPlayers = players.filter((player) => !player.eliminated && Number(player.table) > 0);
		const existingTables = [...new Set(seatedPlayers.map((player) => player.table))].sort((a, b) => a - b);
		const targetTable = existingTables.length
			? existingTables.sort((a, b) =>
				seatedPlayers.filter((player) => player.table === a).length -
				seatedPlayers.filter((player) => player.table === b).length
			)[0]
			: 1;
		const occupiedSeats = seatedPlayers.filter((player) => player.table === targetTable).map((player) => player.seat);
		let targetSeat = 1;
		while (occupiedSeats.includes(targetSeat)) targetSeat += 1;

		players.push({
			id,
			name,
			table: targetTable,
			seat: targetSeat,
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
		// Keep existing seats stable. If adding this player exceeds a table's
		// capacity, offer a split rather than silently redistributing everyone.
		rebalanceTables();
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

		// Keep the eliminated player in their original seat as a visible marker,
		// then offer a table-balancing recommendation if the counts warrant it.
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

		const active = players.filter((player) => !player.eliminated && Number(player.table) > 0);
		if (!active.length) return;

		const grouped = new Map();
		for (const player of active) {
			if (!grouped.has(player.table)) grouped.set(player.table, []);
			grouped.get(player.table).push(player);
		}
		const tableIds = [...grouped.keys()].sort((a, b) => a - b);
		const requiredTables = Math.ceil(active.length / 8);
		const counts = new Map(tableIds.map((id) => [id, grouped.get(id).length]));
		const nextSeat = (tableId, plannedMoves = []) => {
			const occupied = new Set([
				...active.filter((player) => player.table === tableId).map((player) => player.seat),
				...plannedMoves.filter((move) => move.to === tableId).map((move) => move.seat)
			]);
			for (let seat = 1; seat <= 8; seat += 1) if (!occupied.has(seat)) return seat;
			return null;
		};

		// More physical tables than the player count requires: recommend closing the
		// smallest table and distributing its players into tables with spare seats.
		if (tableIds.length > requiredTables) {
			balanceAction = 'merge';
			const sourceTable = [...tableIds].sort((a, b) => counts.get(a) - counts.get(b))[0];
			const destinations = tableIds.filter((id) => id !== sourceTable);
			for (const player of grouped.get(sourceTable)) {
				const destination = destinations
					.filter((id) => counts.get(id) < 8)
					.sort((a, b) => counts.get(a) - counts.get(b))[0];
				if (destination === undefined) break;
				const seat = nextSeat(destination, balanceSuggestions);
				if (seat === null) continue;
				balanceSuggestions.push({ id: player.id, name: player.name, from: sourceTable, to: destination, seat });
				counts.set(sourceTable, counts.get(sourceTable) - 1);
				counts.set(destination, counts.get(destination) + 1);
			}
			if (balanceSuggestions.length) {
				const destinationTables = [...new Set(balanceSuggestions.map((move) => move.to))];
				balanceMessage = destinationTables.length === 1
					? `Merge Table ${sourceTable} into Table ${destinationTables[0]}?`
					: `Merge Table ${sourceTable} and distribute its players across Tables ${destinationTables.join(', ')}?`;
			}
			return;
		}

		// Too few tables or a table exceeding eight: recommend opening a new table.
		if (tableIds.length < requiredTables || Math.max(...counts.values()) > 8) {
			balanceAction = 'split';
			const newTable = Math.max(...tableIds) + 1;
			const targetSize = Math.ceil(active.length / requiredTables);
			let newTableCount = 0;

			// Take players from the fullest existing tables until the new table
			// reaches its share. This keeps all tables within one player where possible.
			while (newTableCount < targetSize) {
				const sourceTable = [...tableIds]
					.filter((id) => counts.get(id) > targetSize)
					.sort((a, b) => counts.get(b) - counts.get(a))[0];
				if (sourceTable === undefined) break;

				const player = [...grouped.get(sourceTable)]
					.filter((item) => !balanceSuggestions.some((move) => move.id === item.id))
					.sort((a, b) => b.seat - a.seat)[0];
				if (!player) break;

				const seat = nextSeat(newTable, balanceSuggestions);
				balanceSuggestions.push({ id: player.id, name: player.name, from: sourceTable, to: newTable, seat: seat ?? newTableCount + 1 });
				counts.set(sourceTable, counts.get(sourceTable) - 1);
				newTableCount += 1;
			}
			if (balanceSuggestions.length) balanceMessage = `Open Table ${newTable} and redistribute players across the tables?`;
			return;
		}

		// Existing tables are valid, but a difference greater than two warrants
		// moving enough players to bring the spread back within two.
		const largest = Math.max(...counts.values());
		const smallest = Math.min(...counts.values());
		if (largest - smallest > 2) {
			balanceAction = 'move';
			const working = new Map(counts);
			const candidates = [...active].sort((a, b) => b.seat - a.seat);
			while (Math.max(...working.values()) - Math.min(...working.values()) > 2) {
				const from = [...tableIds].sort((a, b) => working.get(b) - working.get(a))[0];
				const to = [...tableIds].sort((a, b) => working.get(a) - working.get(b))[0];
				const player = candidates.find((item) => item.table === from && !balanceSuggestions.some((move) => move.id === item.id));
				if (!player || working.get(from) <= 1 || working.get(to) >= 8) break;
				const seat = nextSeat(to, balanceSuggestions);
				if (seat === null) break;
				balanceSuggestions.push({ id: player.id, name: player.name, from, to, seat });
				working.set(from, working.get(from) - 1);
				working.set(to, working.get(to) + 1);
			}
			if (balanceSuggestions.length) balanceMessage = `Move ${balanceSuggestions.length} player(s) to balance the tables?`;
		}
	}
	function applyBalance() {
		const appliedMoves = [...balanceSuggestions];
		const closedTables = balanceAction === 'merge'
			? [...new Set(appliedMoves.map((move) => move.from))]
			: [];

		for (const move of appliedMoves) {
			const player = players.find((item) => item.id === move.id);
			if (player) {
				player.table = move.to;
				player.seat = move.seat;
			}
		}

		// A merge is only complete when every active player has left the source
		// table. Clear its eliminated markers as well, so the table disappears.
		for (const tableId of closedTables) {
			const activeRemain = players.some((player) => !player.eliminated && player.table === tableId && player.seat > 0);
			if (!activeRemain) {
				for (const player of players) {
					if (player.table === tableId) {
						player.table = 0;
						player.seat = 0;
					}
				}
			}
		}

		if (appliedMoves.length) {
			announcementEvent = {
				id: `table-move-${Date.now()}`,
				text: appliedMoves.map((move) => `${move.name}, please move to position ${move.seat} on table ${move.to}`).join('. '),
				createdAt: Date.now()
			};
		}

		balanceSuggestions = [];
		balanceMessage = '';
		balanceAction = 'move';
		void saveTournament();
	}

	/** @param {number} eliminatedPlayerId @param {number} replacementPlayerId */
	function replaceEliminatedSeat(eliminatedPlayerId, replacementPlayerId) {
		const eliminated = players.find((player) => player.id === eliminatedPlayerId && player.eliminated);
		const replacement = players.find((player) => player.id === replacementPlayerId && !player.eliminated);
		if (!eliminated || !replacement || replacement.table === eliminated.table) return;

		const targetTable = eliminated.table;
		const targetSeat = eliminated.seat;
		replacement.table = targetTable;
		replacement.seat = targetSeat;

		// The replacement now occupies this seat; remove the eliminated marker from the layout.
		eliminated.table = 0;
		eliminated.seat = 0;

		announcementEvent = {
			id: `move-${Date.now()}-${replacement.id}`,
			text: `${replacement.name}, please move to position ${targetSeat} on table ${targetTable}`,
			createdAt: Date.now()
		};
		void saveTournament();
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
		if (savingTournament) {
			savePending = true;
			return;
		}
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
			if (savePending) {
				savePending = false;
				void saveTournament();
			}
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

	async function installApp() {
		if (installPrompt) {
			installPrompt.prompt();
			const choice = await installPrompt.userChoice;
			installStatus = choice?.outcome === 'accepted' ? 'App installed.' : '';
			installPrompt = null;
			return;
		}
		installStatus = /iphone|ipad|ipod/i.test(navigator.userAgent)
			? 'To install: tap Share, then Add to Home Screen.'
			: 'Use your browser menu and select Install app or Add to Home Screen.';
	}

	function handleBeforeInstallPrompt(event) {
		event.preventDefault();
		installPrompt = event;
		installStatus = '';
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
		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		window.addEventListener('appinstalled', () => {
			appInstalled = true;
			installPrompt = null;
			installStatus = 'App installed.';
		});
		appInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
		navigator.serviceWorker?.register('/service-worker.js').catch((error) => {
			console.error('Service worker registration failed:', error);
		});
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
			window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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
	<meta name="theme-color" content="#101214" />
	<link rel="manifest" href={`/${venueId}/manifest.webmanifest?name=${encodeURIComponent(venueName)}`} />
	<link rel="icon" href="/poker-app-icon.svg" type="image/svg+xml" />
</svelte:head>

<div
	class="app"
	class:mode-play={running && !currentBlinds?.break}
	class:mode-break={running && currentBlinds?.break}
	class:mode-paused={!running}
>
	<header class="header">
		<div class="header-actions" aria-label="Tournament actions">
			{#if !appInstalled}
				<button class="install-app-button" type="button" onclick={installApp} aria-label="Install poker app">Install app</button>
			{/if}
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
		{#if installStatus}<p class="install-app-status" role="status">{installStatus}</p>{/if}
	</header>

	<nav class="tabs icon-tabs" aria-label="Tournament sections">
		<button class:active={activeTab === 'timer'} type="button" aria-label="Timer" title="Timer" aria-current={activeTab === 'timer' ? 'page' : undefined} onclick={() => (activeTab = 'timer')}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6m-3 0v3"/></svg>
		</button>
		<button class:active={activeTab === 'tables'} type="button" aria-label="Seating" title="Seating" aria-current={activeTab === 'tables' ? 'page' : undefined} onclick={() => (activeTab = 'tables')}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
		</button>
		<button class:active={activeTab === 'setup'} type="button" aria-label="Players" title="Players" aria-current={activeTab === 'setup' ? 'page' : undefined} onclick={() => (activeTab = 'setup')}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 8v6m3-3h-6"/></svg>
		</button>
		<button class:active={activeTab === 'blindlevels'} type="button" aria-label="Blind levels" title="Blind levels" aria-current={activeTab === 'blindlevels' ? 'page' : undefined} onclick={() => (activeTab = 'blindlevels')}>
			<ClockArrowUp size={21} strokeWidth={1.8} />
		</button>
		<button class:active={activeTab === 'payouts'} type="button" aria-label="Payouts" title="Payouts" aria-current={activeTab === 'payouts' ? 'page' : undefined} onclick={() => (activeTab = 'payouts')}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h2m8 0h2"/></svg>
		</button>
	</nav>

	<main>
		{#if activeTab === 'timer'}
			<section
				class="director-dashboard"
				onscroll={(event) => {
					const fullProgress = event.currentTarget.querySelector('.director-sticky-timer .director-progress');
					if (!fullProgress) return;
					// The compact overlay's progress bar sits 75px from the viewport top:
					// 8px top padding + 62px timer + 5px progress margin.
					// Switch when the full-size progress bar reaches that same position.
					const progressTop = fullProgress.getBoundingClientRect().top;
					const alignedTop = 75;
					const hysteresis = 8;
					timerCompact = timerCompact
						? progressTop < alignedTop + hysteresis
						: progressTop <= alignedTop;
				}}
			>
				<div class="director-sticky-timer">
				<div class="director-level-bar">
					<button class="level-arrow" aria-label="Previous blind level" onclick={previousLevel} disabled={currentLevel === 0}>◀</button>
					<button class="level-main" onclick={toggleTimer} aria-label={running ? 'Pause tournament timer' : 'Resume tournament timer'}>
						<span class="director-eyebrow">LEVEL {currentLevel + 1} OF {levels.length} · {running ? 'RUNNING' : 'PAUSED'}</span>
						<span class="director-clock">{formattedTime}</span>
						{#if currentBlinds?.break}
							<strong>BREAK</strong>
							<span class="director-blinds">{currentBlinds.minutes} MINUTES</span>
						{:else}
							{#if mixedGames}<strong>{currentBlinds?.game}</strong>{/if}
							<span class="director-blinds">{currentBlinds?.sb} / {currentBlinds?.bb}</span>
						{/if}
						<span class="director-hint">TAP TO {running ? 'PAUSE' : 'START'}</span>
					</button>
					<button class="level-arrow" aria-label="Next blind level" onclick={nextLevel} disabled={currentLevel >= levels.length - 1}>▶</button>
				</div>
				<div class="director-progress"><div
					class:progress-paused={!running}
					class:progress-break={running && currentBlinds?.break}
					class:progress-ending={running && displaySeconds <= 10}
					style={`width:${progress}%`}
				></div></div>
				<div class="director-level-context">
					<span>PREVIOUS: {#if previousBlinds}{previousBlinds.break ? 'BREAK' : `${previousBlinds.sb} / ${previousBlinds.bb}`}{:else}—{/if}</span>
					<span>NEXT: {#if nextBlinds}{nextBlinds.break ? 'BREAK' : `${nextBlinds.sb} / ${nextBlinds.bb}`}{:else}—{/if}</span>
				</div>
				</div>
				{#if timerCompact}
					<div class="director-compact-overlay" transition:fly={{ y: -18, duration: 180 }}>
						<div class="director-level-bar">
							<button class="level-arrow" aria-label="Previous blind level" onclick={previousLevel} disabled={currentLevel === 0}>◀</button>
							<button class="level-main" onclick={toggleTimer} aria-label={running ? 'Pause tournament timer' : 'Resume tournament timer'}>
								<span class="director-clock">{formattedTime}</span>
								{#if currentBlinds?.break}
									<strong>BREAK</strong>
									<span class="director-blinds">{currentBlinds.minutes} MINUTES</span>
								{:else}
									{#if mixedGames}<strong>{currentBlinds?.game}</strong>{/if}
									<span class="director-blinds">{currentBlinds?.sb} / {currentBlinds?.bb}</span>
								{/if}
							</button>
							<button class="level-arrow" aria-label="Next blind level" onclick={nextLevel} disabled={currentLevel >= levels.length - 1}>▶</button>
						</div>
						<div class="director-progress"><div
							class:progress-paused={!running}
							class:progress-break={running && currentBlinds?.break}
							class:progress-ending={running && displaySeconds <= 10}
							style={`width:${progress}%`}
						></div></div>
					</div>
				{/if}
				<section class="director-players">
					<div class="director-section-heading">
						<div><h1>Players</h1></div>
						<div class="director-player-count"><strong>{activePlayerCount}</strong><span>REMAINING</span></div>
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
									aria-label={player.eliminated ? `Restore ${player.name}` : `Eliminate ${player.name}`}
									onkeydown={(event) => event.key === "Enter" && (player.eliminated ? restorePlayer(player.id) : removePlayer(player.id))}
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
												<span>{player.eliminationPosition}{player.eliminationPosition === 1 ? 'ST' : player.eliminationPosition === 2 ? 'ND' : player.eliminationPosition === 3 ? 'RD' : 'TH'} PLACE</span>
											{/if}
											{#if !player.paid}
												<span class="payment-pill">UNPAID</span>
												{/if}
										</div>
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
				{players}
				{eliminatedPlayers}
				{balanceMessage}
				{balanceSuggestions}
				{activePlayers}
				{tableCount}
				{seatRole}
				{applyBalance}
				replacePlayer={replaceEliminatedSeat}
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
		{#if balanceMessage && balanceSuggestions.length}
			<div class="table-balance-toast" role="status" aria-live="polite">
				<div class="table-balance-toast-copy">
					<strong>{balanceAction === 'merge' ? 'Merge tables' : balanceAction === 'split' ? 'Split table' : 'Balance tables'}</strong>
					<span>{balanceMessage}</span>
					<small>{balanceSuggestions.map((move) => move.name).join(', ')}</small>
				</div>
				<div class="table-balance-toast-actions">
					<button type="button" class="balance-toast-dismiss" onclick={() => { balanceMessage = ''; balanceSuggestions = []; }}>Dismiss</button>
					<button type="button" class="balance-toast-accept" onclick={applyBalance}>Apply</button>
				</div>
			</div>
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

<style>:global(*) {
		box-sizing: border-box;
	}:global(body) {
		margin: 0;
		background: #101214;
		color: #f4f4f1;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}:global(button), :global(input), :global(select) {
		font: inherit;
	}.app {
		height: 100dvh;
		min-height: 100dvh;
		padding: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		transition:
			background-color 0.45s ease,
			background 0.45s ease;
		background:
			#101214;
	}.header, main, .tabs {
		width: min(1400px, 100%);
		margin-left: auto;
		margin-right: auto;
	}.header {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 14px;
	}main {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}.tabs {
		order: 10;
		flex: 0 0 auto;
		margin-top: 8px;
	}.header-actions {
		display: flex;
		gap: 7px;
		flex-wrap: wrap;
	}.label {
		color: #8f969d;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		margin: 0 0 5px;
	}h1, h2, h3 {
		margin: 0;
	}h1 {
		font-size: clamp(1.8rem, 4vw, 3rem);
		letter-spacing: -0.045em;
	}h2 {
		font-size: 1.35rem;
	}h3 {
		font-size: 1rem;
	}button {
		border: 0;
		cursor: pointer;
	}.sound, .add, .clock-button {
		border: 1px solid #343a40;
		background: #181b1f;
		color: #e8eaec;
		padding: 8px 11px;
		border-radius: 9px;
	}.clock-button {
		background: #e7e9ea;
		color: #101214;
		font-weight: 800;
	}.tabs {
		display: flex;
		gap: 4px;
		border-top: 1px solid #292e34;
		padding-top: 5px;
		margin-bottom: 0;
	}.tabs button {
		padding: 9px 14px;
		background: #181b1f;
		color: #7f878e;
		border-bottom: 2px solid transparent;
	}.tabs button.active {
		color: #f4f4f1;
		border-color: #f4f4f1;
	}.mode-play {
		background: #053029;
	}.mode-break {
		background: #641919;
	}.mode-paused {
		background: #173c62;
	}/* =========================
     TIMER TAB
     ========================= */

	.mixed-toggle {
		border: 1px solid #343a40;
		background: #181b1f;
		color: #e8eaec;
		padding: 8px 11px;
		border-radius: 9px;
		font-weight: 700;
	}.mixed-toggle:hover {
		background: #24292f;
	}.primary {
		min-width: 130px;
		background: #f4f4f1;
		color: #101214;
		font-size: 1rem;
		font-weight: 800;
	}.secondary {
		width: 46px;
		background: #24292f;
		color: #f4f4f1;
		font-size: 1.3rem;
		border-radius: 9px;
	}/* =========================
     SETUP
     ========================= */

	.setup-layout {
		height: 100%;
		display: grid;
		grid-template-columns: minmax(430px, 0.9fr) minmax(560px, 1.4fr);
		gap: 14px;
		min-height: 0;
	}.setup-sidebar {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}.levels-card, .setup-card, .payout-card {
		background: #17191b;
		border: 1px solid #292d30;
		border-radius: 14px;
		color: #f2f3f4;
		box-sizing: border-box;
	}.levels-card {
		padding: 15px;
	}.payout-buyin-field { max-width:220px; margin:0 0 16px; }.payout-buyin-field label { display:flex; flex-direction:column; gap:7px; color:#8e969d; font-size:12px; font-weight:700; }.payout-buyin-field input { width:100%; min-height:42px; padding:9px 12px; font-size:16px; }.payout-card {
		padding: 20px;
		min-height: 0;
		overflow: hidden;
	}.setup-card {
		padding: 20px;
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
	}.setup-layout .levels-card {
		overflow: hidden;
	}/* Make the players card substantially wider */
	.setup-sidebar .players-card {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: min(68dvh, 720px);
		min-height: 320px;
		overflow: hidden;
	}
	.setup-sidebar .players-card .player-list {
		flex: 1 1 0;
		min-height: 0;
		overflow-x: auto;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
	}.setup-layout .table {
		overflow: auto;
		max-height: calc(100dvh - 190px);
	}/* On smaller screens, stack the two columns */
	@media (max-width: 1100px) {
		.setup-layout {
			grid-template-columns: 1fr;
		}
		.setup-sidebar {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 18px;
		}
		.players-card {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 700px) {.setup-sidebar {
			display: flex;
			flex-direction: column;
			gap: 18px;
		}.setup-layout {
			display: flex;
			flex-direction: column;
			gap: 18px;
		}
	}.players-card {
		padding: 18px;
		flex: 1 1 auto;
		min-height: 0;
	}.compact-levels .section-heading {
		margin-bottom: 9px;
	}.table {
		width: 100%;
		overflow-x: hidden;
	}.table-row {
		display: grid;
		grid-template-columns: 45px minmax(0, 1.3fr) repeat(3, minmax(0, 1fr)) 30px;
		gap: 6px;
		align-items: center;
		width: 100%;
		padding: 5px;
		border-radius: 8px;
	}.table-row.no-game-column {
		grid-template-columns: 45px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 30px;
	}.table-row input, .table-row select {
		width: 100%;
		min-width: 0;
		padding: 7px;
		border: 1px solid #343a40;
		border-radius: 6px;
		background: #111316;
		color: #f4f4f1;
	}

	@keyframes redtoothViewIn {
		from {
			opacity: 0;
			transform: translateY(5px);
		}

		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
	}.table-row select {
		cursor: pointer;
		appearance: auto;
	}.table-row select option {
		background: #111316;
		color: #f4f4f1;
	}.table-row.active {
		background: #24292f;
	}.break-row {
		background: #5b1717 !important;
		color: #fff;
	}.table-head {
		color: #777f87;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}.table-row input {
		width: 100%;
		min-width: 0;
		padding: 7px;
		border: 1px solid #343a40;
		border-radius: 6px;
		background: #111316;
		color: #f4f4f1;
	}.level-button {
		background: #181b1f;
		color: #f4f4f1;
		text-align: left;
		padding: 7px;
		font-size: 0.75rem;
	}.delete {
		background: #181b1f;
		color: #777f87;
		font-size: 1.1rem;
	}.add-player-form label {
		display: block;
		color: #8f969d;
		font-size: 0.7rem;
		font-weight: 800;
		text-transform: uppercase;
		flex: 1;
	}.add-player-form input, .player-row input {
		display: block;
		width: 100%;
		margin-top: 5px;
		padding: 9px;
		border: 1px solid #343a40;
		border-radius: 7px;
		background: #111316;
		color: #f4f4f1;
	}.add-player-form label {
		min-width: 0;
	}.add-player-form input {
		min-width: 0;
	}.add-player-submit {
		height: 39px;
		min-width: 130px;
		background: #f4f4f1;
		color: #101214;
		font-size: 1rem;
		font-weight: 800;
		border-radius: 9px;
	}.randomise-seats {
		font-size: 1rem;
		height: 39px;
		white-space: nowrap;
		flex: 1 0 auto;
	}.player-list {
		flex: 1 1 auto;
		min-height: 0;
		margin-top: 14px;
		overflow-y: auto;
		padding: 0 8px 24px 0;
	}.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}.list-header span {
		color: #8f969d;
		font-size: 0.75rem;
	}.player-row {
		display: grid;
		grid-template-columns:
			auto
			65px
			65px
			75px
			auto
			auto
			auto
			auto
			75px;
		gap: 5px;
		align-items: center;
		padding: 7px 0;
		border-top: 1px solid #292e34;
	}.player-row input {
		margin: 0;
		min-width: 0;
		max-width: 170px;
	}.player-row span {
		color: #8f969d;
		font-size: 0.7rem;
		white-space: nowrap;
	}.paid-button {
		padding: 5px 8px;
		border-radius: 5px;
		background: #5a2020;
		color: #ffb0b0;
		font-size: 0.65rem;
		font-weight: 800;
		white-space: nowrap;
	}.paid-button.paid {
		background: #214b36;
		color: #a8e6be;
	}.player-row.eliminated {
		opacity: 0.45;
	}.player-row.eliminated input {
		text-decoration: line-through;
	}.tiny {
		padding: 5px 6px;
		border-radius: 5px;
		background: #24292f;
		color: #dfe3e6;
		font-size: 0.6rem;
	}.empty {
		color: #858d95;
		font-size: 0.78rem;
		margin-top: 15px;
	}/* =========================
     PAYOUTS
     ========================= */

	.payout-card {
		max-width: 760px;
	}.pot-total {
		font-size: 2rem;
		font-weight: 800;
	}.money-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		margin-top: 15px;
	}.money-stat {
		padding: 13px;
		border: 1px solid #292e34;
		border-radius: 9px;
		background: #121518;
	}.money-stat span {
		display: block;
		color: #8f969d;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.08em;
	}.money-stat strong {
		display: block;
		margin-top: 3px;
		font-size: 1.15rem;
	}.payout-section {
		margin-top: 22px;
		border-top: 1px solid #292e34;
		padding-top: 18px;
	}.total-percent {
		font-weight: 800;
	}.payout-row {
		display: grid;
		grid-template-columns: 55px 1fr 25px 120px;
		align-items: center;
		gap: 8px;
		padding: 9px 0;
		border-bottom: 1px solid #292e34;
	}.payout-row b {
		text-align: right;
	}.redtooth-linked {
		color: #63b982 !important;
	}.redtooth-unlinked {
		color: #d46b6b !important;
	}/* =========================
     CLOCK MODAL
     ========================= */

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: #101214;
		backdrop-filter: blur(5px);
		display: grid;
		place-items: center;
		z-index: 100;
	}.clock-modal {
		position: relative;
		width: min(430px, calc(100vw - 30px));
		padding: 34px;
		border: 1px solid #444b51;
		border-radius: 20px;
		background: #171a1e;
		text-align: center;
		box-shadow: 0 30px 100px rgba(0, 0, 0, 0.55);
	}.modal-close {
		position: absolute;
		right: 12px;
		top: 8px;
		background: #181b1f;
		color: #8f969d;
		font-size: 1.7rem;
	}.call-clock-number {
		font-size: clamp(7rem, 25vw, 11rem);
		font-weight: 900;
		line-height: 0.95;
		letter-spacing: -0.08em;
		margin: 20px 0 8px;
		font-variant-numeric: tabular-nums;
	}.clock-modal p {
		color: #8f969d;
		margin: 0 0 22px;
	}.clock-controls {
		display: flex;
		justify-content: center;
		gap: 8px;
	}.clock-controls .secondary {
		width: auto;
		padding: 0 18px;
		font-size: 0.9rem;
	}.strobe .call-clock-number {
		animation: clockPulse 0.55s steps(2, end) infinite;
	}

	@keyframes clockPulse {
		50% {
			opacity: 0.58;
			transform: scale(1.025);
		}
	}/* =========================
     RESPONSIVE
     ========================= */

	@media (max-width: 1050px) {
		.setup-layout {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {.app {
			padding: 14px;
		}.header {
			display: block;
		}.header-actions {
			margin-top: 10px;
		}.tabs {
			overflow-x: auto;
		}.money-grid {
			grid-template-columns: repeat(2, 1fr);
		}.player-row {
			grid-template-columns:
				1fr
				80px
				80px;
		}.player-row span, .player-row .tiny {
			font-size: 0.6rem;
		}
	}

	@media (max-width: 500px) {h1 {
			font-size: 1.65rem;
		}.levels-card, .setup-card, .payout-card {
			padding: 13px;
		}.player-row {
			grid-template-columns: 1fr 1fr;
		}.player-row input {
			grid-column: 1 / -1;
		}.payout-row {
			grid-template-columns: 45px 80px 20px 1fr;
		}

	}.add-player-form {
		display: flex;
		align-items: center;
		gap: 12px;
	}.redtooth-player-input {
		margin-top: 10px;
		display: block;
	}.redtooth-autocomplete {
		position: relative;
	}.redtooth-search-results {
		position: absolute;
		z-index: 100;
		left: 0;
		right: 0;
		top: calc(100% + 4px);
		background: #202428;
		border: 1px solid #3b4249;
		border-radius: 9px;
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
		overflow: hidden;
	}.redtooth-search-result {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		background: #202428;
		color: #f4f4f1;
		text-align: left;
		border-bottom: 1px solid #30363c;
		cursor: pointer;
	}.redtooth-search-result:last-child {
		border-bottom: 0;
	}.redtooth-search-result:hover {
		background: #2b3137;
	}.redtooth-search-result strong {
		display: block;
		color: #f4f4f1;
		font-size: 13px;
	}.redtooth-search-result small {
		display: block;
		margin-top: 2px;
		color: #aeb5bb;
		font-size: 10px;
	}.redtooth-search-position {
		flex-shrink: 0;
		color: #7ed39b;
		font-size: 12px;
		font-weight: 800;
	}.cast-status { color: #9aa1a8; font-size: 0.72rem; margin-top: 8px; }.level-actions {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 8px;
		margin: 4px 0;
	}.add-level-after, .add-break {
		border: 0;
		background: #181b1f;
		font-size: 0.65rem;
		font-weight: 700;
		cursor: pointer;
		padding: 4px 8px;
	}.add-level-after {
		color: #8a9197;
	}.add-level-after:hover {
		color: #d0d4d7;
	}.add-break {
		color: #a85b60;
	}.add-break:hover {
		color: #d37a80;
	}.player-position {
		display: flex;
		align-items: center;
		gap: 6px;
	}.elimination-order-controls {
		display: flex;
		gap: 2px;
	}.order-button {
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid #3a3f43;
		border-radius: 4px;
		background: #222528;
		color: #c8cdd1;
		font-size: 13px;
		line-height: 1;
		cursor: pointer;
	}.order-button:hover:not(:disabled) {
		background: #303438;
		color: #fff;
	}.order-button:disabled {
		opacity: 0.25;
		cursor: default;
	}/* Tournament Director: black and gold control surface */
	.app, .mode-play, .mode-break, .mode-paused {
		background: #101214 !important;
		color: #f4f0e7;
	}.header { border-bottom: 1px solid rgba(196,163,106,.2); padding-bottom: 12px; }.sound, .add, .clock-button, .tabs button, .secondary, .mixed-toggle {
		background: #171717; color: #d8c49c; border: 1px solid #5a482b; border-radius: 8px;
	}.clock-button, .tabs button.active { background: #c4a36a; color: #111; border-color: #c4a36a; }.tabs { border-color: rgba(196,163,106,.25); }.tabs button.active { border-bottom-color: #c4a36a; }.levels-card, .setup-card, .payout-card, .director-players {
		background: #141414; border: 1px solid #403522; border-radius: 14px; color: #f4f0e7;
	}.primary { background: #c4a36a; color: #111; border-radius: 8px; }input, select { background: #0c0d0e; color: #f4f0e7; border: 1px solid #51432c; border-radius: 7px; }.director-dashboard { height:100%; min-height:0; overflow:auto; padding: 0 0 22px; }.director-level-bar { display:grid; grid-template-columns:56px minmax(0,1fr) 56px; gap:10px; align-items:stretch; max-width:900px; margin:0 auto; }.level-arrow { border:1px solid #6b5732; border-radius:12px; background:#171512; color:#c4a36a; font-size:22px; font-weight:900; min-height:150px; touch-action:manipulation; }.level-arrow:disabled { opacity:.25; }.level-main { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; min-height:150px; padding:14px; border:1px solid #80683b; border-radius:12px; background:#181b1f; color:#f4f0e7; touch-action:manipulation; }.director-eyebrow { color:#c4a36a; font-size:10px; font-weight:900; letter-spacing:.18em; }.level-main strong { color:#f3e5c5; font-size:clamp(20px,3vw,30px); letter-spacing:.08em; }.director-blinds { color:#c4a36a; font-size:clamp(21px,4vw,34px); font-weight:900; font-variant-numeric:tabular-nums; }.director-clock { color:#fff; font-size:clamp(34px,7vw,58px); line-height:1; font-weight:900; font-variant-numeric:tabular-nums; }.director-hint { color:#95876e; font-size:9px; letter-spacing:.16em; font-weight:800; }.director-progress { height:4px; max-width:850px; margin:9px auto 0; background:#29251e; border-radius:9px; overflow:hidden; }.director-progress div { height:100%; background:#c4a36a; transition:width .25s linear; }.director-progress div.progress-paused { background:#b94a4a; }.director-progress div.progress-break { background:#315f91; }.director-progress div.progress-ending { animation: progress-ending-glow 1s ease-in-out infinite; }
	@keyframes progress-ending-glow {
		0%, 100% { filter:brightness(1); box-shadow:0 0 2px rgba(196,163,106,.35); }
		50% { filter:brightness(1.55); box-shadow:0 0 12px 3px rgba(196,163,106,.9); }
	}
	@media (prefers-reduced-motion: reduce) {.director-progress div.progress-ending { animation:none; filter:brightness(1.35); box-shadow:0 0 8px 2px rgba(196,163,106,.65); }
	}.director-level-context { display:flex; justify-content:space-between; gap:12px; max-width:850px; margin:8px auto 18px; color:#8f8779; font-size:10px; font-weight:800; letter-spacing:.08em; }.director-players { max-width:900px; margin:0 auto; padding:16px; }.director-section-heading { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }.director-section-heading h1 { color:#f4f0e7; font-size:24px; margin-top:3px; }.director-player-count { display:flex; align-items:center; gap:7px; color:#c4a36a; font-size:10px; font-weight:800; letter-spacing:.12em; }.director-player-count strong { font-size:26px; }.director-player-list { display:flex; flex-direction:column; gap:6px; }.director-player-swipe { position:relative; overflow:hidden; isolation:isolate; border-radius:9px; touch-action:pan-y; user-select:none; }.director-player-swipe .director-player-row { position:relative; z-index:2; opacity:1 !important; background:#101214 !important; transition:transform .2s ease; }.director-player-swipe.dragging .director-player-row { transition:none; }.swipe-trash-reveal { position:absolute; inset:2px 2px 2px auto; width:112px; display:flex; align-items:center; justify-content:center; gap:7px; border-radius:0 !important; background:#b83c3c; color:#fff; } .swipe-trash-reveal span { color:#111; font-size:10px; font-weight:900; letter-spacing:.035em; white-space:nowrap; }.swipe-payment-reveal { position:absolute; inset:2px auto 2px 2px; width:112px; display:flex; align-items:center; justify-content:center; border-radius:0 !important; background:#397b58; color:#fff; font-size:10px; font-weight:900; letter-spacing:.06em; }.payment-pill { display:inline-flex; align-items:center; width:max-content; padding:4px 9px; border:1px solid #ef5350; border-radius:999px; background:#c62828; color:#fff !important; font-size:10px !important; font-weight:900; letter-spacing:.08em; box-shadow:0 0 0 1px #c62828; }.payment-pill.paid { border-color:rgba(105,169,130,.35); background:#234532; color:#9cc9aa !important; }.director-player-row { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:58px; padding:9px 10px; border:1px solid #30291e; border-radius:9px; background:#191817; }.director-player-identity { display:flex; flex-direction:column; min-width:0; gap:4px; }.director-player-identity strong { overflow-wrap:anywhere; color:#f2eee5; font-size:14px; }.director-player-identity span { color:#8f8779; font-size:9px; font-weight:800; letter-spacing:.08em; }.restore-button { min-height:38px; border-radius:7px; padding:0 12px; background:#3b2020; border:1px solid #704040; color:#f2b5a9; font-size:10px; font-weight:900; letter-spacing:.06em; touch-action:manipulation; }.director-eliminated-heading { margin:18px 0 8px; color:#c4a36a; font-size:10px; font-weight:900; letter-spacing:.16em; }.is-eliminated { opacity:1 !important; background:#101214 !important; }.is-eliminated .director-player-identity strong { text-decoration:line-through; color:#a49b8d; }.director-eliminated-actions { display:flex; align-items:center; gap:8px; }.restore-button { background:#1d2b22; border-color:#405c43; color:#b8d6a7; white-space:nowrap; }.director-empty { padding:26px 12px; text-align:center; color:#8f8779; }.order-button { width:30px; height:30px; border-radius:6px; background:#211e18; border-color:#5a482b; color:#c4a36a; touch-action:manipulation; }
	@media (max-width:700px) {.app { height:100dvh; min-height:100dvh; padding:10px 10px max(8px, env(safe-area-inset-bottom)); }.header { align-items:flex-start; gap:8px; margin-bottom:8px; }.header-actions { justify-content:flex-end; gap:5px; }.header-actions .sound { display:none; }.clock-button { padding:7px 9px; font-size:11px; }.tabs { gap:2px; overflow-x:auto; white-space:nowrap; margin-top:6px; }.tabs button { flex:1 0 auto; padding:9px 10px; font-size:12px; }main { overflow:hidden; }.director-dashboard { padding-bottom:12px; }.director-level-bar { grid-template-columns:42px minmax(0,1fr) 42px; gap:6px; }.level-arrow { min-height:136px; font-size:17px; }.level-main { min-height:136px; padding:9px 5px; }.director-clock { font-size:clamp(38px,12vw,54px); }.director-level-context { font-size:9px; margin-bottom:12px; }.director-players { padding:11px; }.director-player-row { min-height:60px; padding:8px; gap:7px; }.director-player-identity strong { font-size:13px; }.restore-button { min-height:42px; padding:0 9px; font-size:9px; }.director-eliminated-actions { gap:5px; }.director-eliminated-actions .order-button { width:27px; height:30px; }.setup-layout, .setup-sidebar { display:flex; flex-direction:column; }.setup-layout .table { max-height:none; }
	}/* Match the original Chromecast receiver colourway throughout the TDC */
	.app, .mode-play, .mode-break, .mode-paused {
		background: #101214 !important;
		color: #f4f4f1 !important;
	}.levels-card, .setup-card, .payout-card, .clock-modal {
		background: #181b1f !important;
		border-color: #343a40 !important;
		color: #f4f4f1 !important;
	}.director-players {
		background: #181b1f !important;
		border-color: transparent !important;
		color: #f4f4f1 !important;
	}.director-eyebrow, .director-blinds, .director-player-count, .director-eliminated-heading {
		color: #c4a36a !important;
	}.header { border-bottom-color: rgba(196,163,106,.2) !important; }.tabs { border-color: rgba(196,163,106,.25) !important; }.tabs button, .sound, .add, .secondary, .mixed-toggle, .level-arrow, .order-button {
		background: #181b1f !important;
		color: #d8c49c !important;
		border-color: #343a40 !important;
	}.clock-button, .tabs button.active, .primary {
		background: #c4a36a !important;
		color: #101214 !important;
		border-color: #c4a36a !important;
	}.level-main {
		background: #181b1f !important;
		border-color: #5b4b32 !important;
	}.director-player-row {
		background: #181b1f !important;
		border-color: #343a40 !important;
	}.director-player-identity strong, .director-section-heading h1 { color: #f4f4f1 !important; }.director-player-identity span, .director-hint, .director-level-context, .director-empty { color: #8e969d !important; }.director-progress { background: #292e34 !important; }input, select, .add-player-form input, .player-row input {
		background: #101214 !important;
		color: #f4f4f1 !important;
		border-color: #343a40 !important;
	}/* Refined receiver-led palette: gold is an accent, never a dominant surface */
	.sound, .add, .clock-button, .tabs button, .secondary, .mixed-toggle, .primary, .level-arrow, .order-button {
		background: #181b1f !important;
		color: #d5d9dc !important;
		border: 1px solid #343a40 !important;
		box-shadow: none !important;
	}.clock-button:hover, .sound:hover, .add:hover, .secondary:hover, .tabs button:hover, .primary:hover, .level-arrow:hover:not(:disabled), .order-button:hover:not(:disabled) {
		background: #24282d !important;
		color: #f4f4f1 !important;
		border-color: #4a5158 !important;
	}.tabs button.active {
		background: #24282d !important;
		color: #c4a36a !important;
		border-color: #343a40 !important;
		box-shadow: inset 0 -2px 0 #c4a36a !important;
	}.level-main {
		background: #181b1f !important;
		border-color: #343a40 !important;
		box-shadow: none !important;
	}.director-eyebrow, .director-blinds {
		color: #f4f4f1 !important;
	}.director-hint, .director-level-context, .director-player-count {
		color: #8e969d !important;
	}.director-player-count strong {
		color: #f4f4f1 !important;
	}.director-eliminated-heading {
		color: #c4a36a !important;
	}.director-progress div {
		background: #c4a36a !important;
	}.order-button {
		background: #181b1f !important;
		color: #cbd0d4 !important;
		border-color: #343a40 !important;
	}/* Responsive header: keep every tournament action available at every width */
	.header {
		flex-wrap: wrap !important;
		align-items: center !important;
		column-gap: 20px !important;
		row-gap: 12px !important;
	}.header > div:first-child {
		flex: 0 0 auto;
	}.header-actions {
		flex: 1 1 560px;
		min-width: 0;
		display: grid !important;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		align-items: center;
		gap: 6px !important;
	}.header-actions > button {
		min-width: 0;
		min-height: 38px;
		padding: 8px 10px;
		white-space: nowrap;
		font-size: 12px;
	}.header-actions .sound {
		display: inline-flex !important;
		align-items: center;
		justify-content: center;
	}.header-actions .cast-status {
		grid-column: 1 / -1;
	}/* At tablet widths, let the toolbar occupy its own row rather than clipping. */
	@media (max-width: 1050px) {
		.header > div:first-child { flex-basis: 100%; }
		.header-actions {
			flex-basis: 100%;
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (max-width: 700px) {.header {
			align-items: stretch !important;
			margin-bottom: 8px !important;
		}.header > div:first-child { flex-basis: 100%; }.header-actions {
			width: 100%;
			flex-basis: 100%;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 6px !important;
		}.header-actions > button {
			min-height: 40px;
			padding: 8px 6px;
			font-size: 11px;
		}
	}/* Cleaner timer controls: use spacing and contrast, not outlined boxes. */
	.level-arrow {
		border: 0 !important;
		border-radius: 8px !important;
		background: #181b1f !important;
		color: #aeb5bb !important;
		font-size: 30px !important;
		box-shadow: none !important;
		transition: color .15s ease, background .15s ease !important;
	}.level-arrow:hover:not(:disabled) {
		background: #252a30 !important;
		color: #f4f4f1 !important;
	}.level-arrow:disabled {
		background: #181b1f !important;
		color: #51585e !important;
		opacity: 1 !important;
	}.level-main {
		border: 0 !important;
		border-radius: 14px !important;
		background: #181b1f !important;
		box-shadow: none !important;
	}.director-level-bar { gap: 4px !important; }.director-progress { height: 3px !important; }/* Replace individual player boxes with quiet separators. */
	.director-players {
		border: 0 !important;
		background: #101214 !important;
		box-shadow: none !important;
	}.director-player-row {
		border: 0 !important;
		border-bottom: 1px solid rgba(255,255,255,.07) !important;
		border-radius: 0 !important;
		background: #101214 !important;
	}.director-player-row:last-child { border-bottom: 0 !important; }.order-button {
		border: 0 !important;
		background: #181b1f !important;
		color: #aeb5bb !important;
		font-size: 16px !important;
	}.order-button:hover:not(:disabled) {
		background: #252a30 !important;
		color: #f4f4f1 !important;
	}.restore-button {
		border: 0 !important;
		background: #452626 !important;
		color: #e1a09b !important;
	}.restore-button {
		background: #243d2c !important;
		color: #a9c9ad !important;
	}/* Header settings control and compact preferences modal */
	.header-actions {
		flex: 1 1 auto !important;
		min-width: 0;
		display: flex !important;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 8px !important;
	}.header-actions > button { flex: 0 0 auto; }.settings-button {
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 9px;
		background: #24282d;
		color: #d5d9dc;
		font-size: 22px;
		cursor: pointer;
	}.settings-button:hover { background: #30363c; color: #fff; }.settings-backdrop { z-index: 110; padding: 16px; }.settings-modal {
		width: min(440px, 100%);
		padding: 22px;
		border: 1px solid #343a40;
		border-radius: 16px;
		background: #181b1f;
		color: #f4f4f1;
		box-shadow: 0 22px 70px rgba(0,0,0,.5);
	}.settings-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; }.settings-heading h2 { margin:4px 0 0; color:#f4f4f1; font-size:20px; }.settings-eyebrow { color:#8e969d; font-size:9px; font-weight:800; letter-spacing:.16em; }.settings-option, .settings-danger { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 0; border-top:1px solid rgba(255,255,255,.08); }.settings-number-option > div { min-width:0; }.settings-number { flex:0 0 76px; width:76px; min-height:40px; padding:7px 9px; text-align:center; font-size:16px; font-weight:800; }.settings-option strong, .settings-danger strong { display:block; font-size:14px; font-weight:650; }.settings-option span:not(.settings-switch span), .settings-danger span { display:block; margin-top:4px; color:#8e969d; font-size:11px; line-height:1.4; }.settings-switch { flex:0 0 auto; width:44px; height:26px; padding:3px; border:0; border-radius:20px; background:#454c53; cursor:pointer; transition:background .15s ease; }.settings-switch > span { display:block; width:20px; height:20px; border-radius:50%; background:#f4f4f1; transition:transform .15s ease; }.settings-switch.enabled { background:#8b754e; }.settings-switch.enabled > span { transform:translateX(18px); }.settings-venue-link { color:#d5d9dc; background:#292e34; border-radius:7px; padding:9px 12px; text-decoration:none; font-size:12px; font-weight:800; white-space:nowrap; }.settings-danger { margin-top:4px; }.settings-reset { flex:0 0 auto; padding:9px 13px; border:0; border-radius:7px; background:#452626; color:#e1a09b; font-size:12px; font-weight:750; cursor:pointer; }.settings-reset:hover { background:#603030; }
	@media (max-width:700px) {.header-actions { flex:1 1 100% !important; display:flex !important; flex-wrap:nowrap; justify-content:flex-start; }.header-actions > button { min-height:40px; }.settings-button { width:40px; min-width:40px; }.settings-modal { padding:18px; }
	}/* Timer hierarchy: prominent countdown, quieter blind information */
	.level-main { gap: 7px !important; }.director-clock {
		order: 2;
		font-size: clamp(58px, 9vw, 88px) !important;
		line-height: .98 !important;
		letter-spacing: -.045em;
	}.level-main strong { order: 3; font-size: 13px !important; letter-spacing: .12em !important; color: #aeb5bb !important; }.director-blinds { order: 4; font-size: clamp(17px, 2.4vw, 23px) !important; font-weight: 650 !important; color: #aeb5bb !important; }.director-hint { order: 5; }.director-eyebrow { order: 1; }
	@media (max-width:700px) {.director-clock { font-size: clamp(56px, 16vw, 76px) !important; }.director-blinds { font-size: 17px !important; }
	}/* Timer refinements: larger settings control, email-style player rows and text tabs. */
	.settings-button {
		width: 48px !important;
		min-width: 48px !important;
		height: 48px !important;
		font-size: 29px !important;
		border-radius: 11px !important;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}.director-player-list {
		display: flex !important;
		flex-direction: column !important;
		gap: 0 !important;
		overflow: hidden;
		border-top: 1px solid #343a40;
		border-bottom: 1px solid #343a40;
		background: #101214 !important;
	}.director-player-swipe {
		border-bottom: 1px solid #343a40;
		background: #181b1f;
	}.director-player-swipe:last-child {
		border-bottom: 0;
	}.director-player-row {
		min-height: 62px !important;
		padding: 12px 14px !important;
		border: 0 !important;
		border-radius: 0 !important;
		background: #181b1f !important;
	}.director-player-identity strong {
		font-size: 17px !important;
		line-height: 1.3;
		font-weight: 650 !important;
	}.director-player-list.eliminated-list .director-player-row {
		border-bottom: 1px solid #343a40 !important;
	}.director-player-list.eliminated-list .director-player-row:last-child {
		border-bottom: 0 !important;
	}.tabs {
		display: flex !important;
		gap: 22px !important;
		padding: 0 2px 1px !important;
		border: 0 !important;
		border-bottom: 1px solid #30353a !important;
		overflow-x: auto;
	}.tabs button {
		flex: 0 0 auto !important;
		padding: 11px 2px 10px !important;
		border: 0 !important;
		border-bottom: 2px solid transparent !important;
		border-radius: 0 !important;
		background: #181b1f !important;
		color: #929aa1 !important;
		font-size: 13px !important;
		font-weight: 600 !important;
		box-shadow: none !important;
	}.tabs button:hover {
		background: #181b1f !important;
		color: #f0f1ef !important;
	}.tabs button.active {
		background: #181b1f !important;
		color: #f4f4f1 !important;
		border: 0 !important;
		border-bottom: 2px solid #c4a36a !important;
		box-shadow: none !important;
	}

	@media (max-width: 700px) {.settings-button {
			width: 46px !important;
			min-width: 46px !important;
			height: 46px !important;
			font-size: 28px !important;
		}.director-player-row {
			min-height: 58px !important;
			padding: 11px 12px !important;
		}.director-player-identity strong {
			font-size: 16px !important;
		}.tabs {
			gap: 18px !important;
		}
	}/* Keep the settings control aligned with the other header actions. */
	.settings-button {
		width: 40px !important;
		min-width: 40px !important;
		height: 40px !important;
		min-height: 40px !important;
		padding: 0 !important;
		font-size: 23px !important;
		border-radius: 9px !important;
		line-height: 1 !important;
	}

	@media (max-width: 700px) {.settings-button {
			width: 40px !important;
			min-width: 40px !important;
			height: 40px !important;
			min-height: 40px !important;
			font-size: 23px !important;
		}
	}/* Timer state colours: placed after the shared progress-bar override. */
	.director-progress div.progress-paused {
		background: #d94b50 !important;
	}.director-progress div.progress-break {
		background: #397fbd !important;
	}.director-progress div.progress-ending {
		animation: progress-ending-glow 1s ease-in-out infinite;
	}/* Setup page responsive layout and independent player-list scrolling */
	.setup-layout {
		min-width: 0;
	}

	@media (max-width: 1100px) {main:has(.setup-layout) {
			min-height: 0;
			overflow-x: hidden !important;
			overflow-y: auto !important;
			overscroll-behavior-y: contain;
		}.setup-layout {
			display: flex !important;
			flex-direction: column !important;
			align-items: stretch;
			height: auto !important;
			min-height: 0;
			gap: 14px;
			overflow: visible;
		}.setup-layout > .levels-card {
			flex: 0 0 auto;
			width: 100%;
			min-width: 0;
			padding: 18px;
			overflow: visible !important;
		}.setup-layout .table {
			max-height: none !important;
			overflow-x: auto;
			overflow-y: visible;
		}.setup-layout .table-row {
			min-width: 420px;
		}.setup-sidebar {
			display: flex !important;
			flex: 0 0 auto;
			flex-direction: column !important;
			width: 100%;
			min-width: 0;
			gap: 14px;
		}.setup-sidebar .players-card {
			display: flex;
			flex: 0 0 auto;
			flex-direction: column;
			width: 100%;
			height: min(62dvh, 560px);
			min-height: 300px;
			overflow: hidden;
		}.setup-sidebar .players-card .player-list {
			flex: 1 1 0;
			min-height: 0;
			overflow-x: auto;
			overflow-y: auto;
			overscroll-behavior: contain;
			-webkit-overflow-scrolling: touch;
		}
	}

	@media (max-width: 700px) {main:has(.setup-layout) {
			padding-bottom: 12px;
		}.setup-layout {
			gap: 12px;
		}.setup-layout > .levels-card {
			padding: 14px 12px;
		}.setup-layout .section-heading {
			align-items: flex-start;
			flex-wrap: wrap;
			gap: 10px;
		}.setup-layout .section-actions {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
			width: 100%;
		}.setup-layout .section-actions > button {
			min-height: 38px;
		}.setup-layout .table-row {
			min-width: 410px;
			gap: 5px;
		}.setup-sidebar .players-card {
			height: min(58dvh, 460px);
			min-height: 260px;
			padding: 14px;
		}.setup-sidebar .add-player-form {
			flex-wrap: wrap;
		}
	}


/* Compact Lucide-style icon toolbar and section navigation. */
.icon-action {
	width: 40px !important;
	min-width: 40px !important;
	height: 40px !important;
	min-height: 40px !important;
	padding: 0 !important;
	display: inline-flex !important;
	align-items: center !important;
	justify-content: center !important;
	border-radius: 9px !important;
}
.icon-action svg, .icon-tabs svg {
	width: 20px;
	height: 20px;
	fill: none;
	stroke: currentColor;
	stroke-width: 1.8;
	stroke-linecap: round;
	stroke-linejoin: round;
	flex: 0 0 auto;
}
.icon-tabs {
	gap: 14px !important;
}
.icon-tabs button {
	width: 42px;
	min-width: 42px;
	height: 42px;
	padding: 0 !important;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}
.icon-tabs svg { width: 21px; height: 21px; }
@media (max-width: 700px) {
	.header-actions { flex: 0 0 auto !important; width: auto !important; }
	.header-actions > button { flex: 0 0 40px !important; }
	.icon-tabs { justify-content: space-around; gap: 8px !important; }
	.icon-tabs button { flex: 1 1 0 !important; max-width: 56px; }
}

	/* Players tab: rebuilt roster layout */
	.players-workspace { display:flex; flex-direction:column; gap:18px; width:100%; max-width:1200px; min-height:0; margin:0 auto; }
	.players-panel-heading { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:20px 22px; background:#17191b; border:1px solid #292d30; border-radius:14px; }
	.players-panel-heading h2 { margin:4px 0 3px; color:#f2f3f4; font-size:1.55rem; }
	.players-panel-heading p { margin:0; color:#8f969d; font-size:.82rem; }
	.players-summary { display:flex; gap:10px; }
	.players-summary > div { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:76px; padding:9px 13px; background:#111316; border:1px solid #30353a; border-radius:9px; }
	.players-summary strong { color:#f4f4f1; font-size:1.25rem; font-variant-numeric:tabular-nums; }
	.players-summary span { color:#929aa1; font-size:.65rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
	.players-add-panel { display:flex; align-items:flex-end; gap:12px; padding:16px 18px; background:#17191b; border:1px solid #292d30; border-radius:14px; }
	.players-add-form { display:flex; align-items:flex-end; flex:1; gap:10px; min-width:0; }
	.players-add-form .redtooth-player-input { flex:1; min-width:0; margin:0; }
	.players-add-form .redtooth-player-input > span { display:block; margin-bottom:6px; color:#9ba2a8; font-size:.68rem; font-weight:800; text-transform:uppercase; }
	.players-add-form .redtooth-autocomplete { width:100%; }
	.players-add-form input { box-sizing:border-box; width:100%; min-height:42px; margin:0; padding:10px 12px; border:1px solid #343a40; border-radius:8px; background:#111316; color:#f4f4f1; }
	.players-add-form .add-player-submit, .players-randomise { min-height:42px; height:42px; padding:0 16px; white-space:nowrap; }
	.players-roster { display:flex; flex-direction:column; flex:1 1 auto; min-height:240px; height:calc(100dvh - 350px); max-height:calc(100dvh - 350px); box-sizing:border-box; padding:16px 18px; overflow:hidden; background:#17191b; border:1px solid #292d30; border-radius:14px; }
	.players-roster-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; padding-bottom:12px; border-bottom:1px solid #30353a; }
	.players-roster-heading h3 { margin:0; color:#f2f3f4; font-size:1rem; }
	.players-roster-heading > span { color:#858d95; font-size:.72rem; text-align:right; }
	.players-roster-list { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; padding-bottom:calc(76px + env(safe-area-inset-bottom)); scroll-padding-bottom:calc(76px + env(safe-area-inset-bottom)); }
	.players-roster-table-heading, .players-roster-row { display:grid; grid-template-columns:minmax(180px, 1fr) minmax(130px, 220px) 88px; align-items:center; column-gap:16px; padding:10px 8px; }
	.players-roster-table-heading { position:sticky; top:0; z-index:1; background:#17191b; border-bottom:1px solid #3a4046; color:#858d95; font-size:.67rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
	.players-roster-row { border-bottom:1px solid #292e34; }
	
	.players-name-input { box-sizing:border-box; width:min(100%,360px); min-height:34px; padding:6px 9px; border:1px solid transparent; border-radius:0; background:#181b1f; color:#f4f4f1; font:inherit; font-size:.9rem; }
	.players-name-input:not(:disabled):hover { border-bottom-color:#454c53; }
	.players-name-input:not(:disabled):focus { border:1px solid #59636d; border-radius:6px; outline:none; background:#111316; }
	.players-name-input:disabled { opacity:1; cursor:default; }
	
	.roster-tag { display:inline-flex; align-items:center; padding:3px 7px; border-radius:5px; background:#252a2f; color:#aeb5bb; font-size:.62rem; font-weight:750; white-space:nowrap; }
	.tag-linked { background:#1d3c2b; color:#8bd5a4; }.tag-unlinked { background:#422525; color:#e5a0a0; }.tag-place { background:#40351d; color:#e6c77f; }
	.roster-status { display:flex; align-items:center; }
	.delete-player-button { justify-self:end; min-height:30px; padding:6px 10px; font-size:.68rem; background:#3b2525; color:#e9aaaa; }
	
	.players-empty { padding:20px 0; }
	@media (max-width:760px) {
		.players-panel-heading { align-items:flex-start; flex-direction:column; padding:16px; }
		.players-summary { width:100%; }.players-summary > div { flex:1; min-width:0; }
		.players-add-panel { align-items:stretch; flex-direction:column; padding:14px; }
		.players-add-form { align-items:stretch; flex-direction:column; }
		.players-add-form .add-player-submit, .players-randomise { width:100%; }
		.players-roster { flex:0 0 auto; height:50vh; max-height:50vh; min-height:260px; padding:13px; }
		.players-roster-heading { align-items:flex-start; flex-direction:column; }
		.players-roster-heading > span { text-align:left; }
		.players-roster-table-heading, .players-roster-row { grid-template-columns:minmax(0, 1fr) minmax(100px, 130px) 68px; column-gap:8px; padding:9px 3px; }
		.players-roster-table-heading { font-size:.58rem; }
		.players-name-input { width:100%; min-width:0; }
		.delete-player-button { padding:5px 7px; }
	}

	.players-name-label { display:flex; align-items:center; width:min(100%,360px); min-height:34px; padding:6px 9px; color:#f4f4f1; font-size:.9rem; overflow-wrap:anywhere; }

	/* Keep the unpaid indicator inline and aligned to the right of the name. */
	.director-player-identity {
		display:flex !important;
		flex-direction:row !important;
		align-items:center !important;
		justify-content:space-between !important;
		width:100%;
		gap:12px !important;
	}
	.payment-pill {
		flex:0 0 auto;
		margin-left:auto;
		border-color:#ef5350 !important;
		background:#c62828 !important;
		color:#fff !important;
	}

	/* Refined unpaid status and flat player-list separators. */
	.payment-pill {
		padding: 3px 8px !important;
		border: 1px solid #704044 !important;
		border-radius: 999px !important;
		background: #392326 !important;
		color: #e6a2a5 !important;
		font-size: 9px !important;
		font-weight: 750 !important;
		letter-spacing: .06em !important;
		box-shadow: none !important;
	}
	.director-player-list {
		border-top: 0 !important;
		border-bottom: 0 !important;
		border-radius: 0 !important;
		overflow: visible !important;
	}
	.director-player-swipe {
		overflow: hidden !important;
		border: none !important;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
		outline: none !important;
		box-shadow: none !important;
		border-image: none !important;
		border-radius: 0 !important;
		background: #181b1f !important;
		background-image: none !important;
	}
	.director-player-swipe:last-child {
		border-bottom: 0 !important;
	}
	.director-player-row,
	.director-player-list.eliminated-list .director-player-row {
		border: none !important;
		outline: none !important;
		box-shadow: none !important;
		border-image: none !important;
		border-radius: 0 !important;
		background: #181b1f !important;
		background-image: none !important;
	}

	/* Bottom icon navigation should sit directly on the app surface. */
	.icon-tabs,
	.icon-tabs button,
	.icon-tabs button:hover,
	.icon-tabs button:focus,
	.icon-tabs button:active {
		background: transparent !important;
		box-shadow: none !important;
	}
	.icon-tabs button.active {
		background: transparent !important;
		color: #c4a36a !important;
		box-shadow: none !important;
	}

	/* Player rows: remove the coloured outline/frame on every swipe row. */
	.director-player-list .director-player-swipe {
		border: 0 !important;
		border-bottom: 1px solid rgba(255, 255, 255, 0.18) !important;
		border-radius: 0 !important;
		outline: 0 !important;
		box-shadow: none !important;
		background-image: none !important;
	}
	.director-player-list .director-player-swipe:last-child {
		border-bottom: 0 !important;
	}
	.director-player-list .director-player-row,
	.director-player-list .director-player-row.is-eliminated {
		border: 0 !important;
		outline: 0 !important;
		box-shadow: none !important;
		background-image: none !important;
	}
	.director-player-list .director-player-swipe::before,
	.director-player-list .director-player-swipe::after,
	.director-player-list .director-player-row::before,
	.director-player-list .director-player-row::after {
		content: none !important;
		display: none !important;
	}
	/* Let the timer dashboard escape the app's padded, max-width content column. */
	.director-dashboard {
		width: 100vw !important;
		max-width: none !important;
		margin-left: calc(50% - 50vw) !important;
		margin-right: calc(50% - 50vw) !important;
	}
	/* Full-width, square-edged player list and swipe action panels. */
	.director-players {
		width: 100% !important;
		max-width: none !important;
		margin: 0 !important;
		padding-left: 0 !important;
		padding-right: 0 !important;
		box-sizing: border-box !important;
	}
	.director-player-list,
	.director-player-swipe {
		width: 100% !important;
		border-radius: 0 !important;
	}
	.swipe-trash-reveal,
	.swipe-payment-reveal {
		border-radius: 0 !important;
	}
	/* Timer page: remove the enclosing card/frame around the player list. */
	.director-dashboard > .director-players,
	.director-players {
		border: none !important;
		outline: none !important;
		box-shadow: none !important;
		background: transparent !important;
	}
	.director-players::before,
	.director-players::after {
		content: none !important;
		display: none !important;
	}


/* Keep dashboard headings and blind context inside narrow mobile screens. */
.director-section-heading {
	width: 100%;
	min-width: 0;
	gap: 8px;
	box-sizing: border-box;
}
.director-section-heading > div:first-child {
	min-width: 0;
	flex: 1 1 auto;
}
.director-section-heading h1 {
	font-size: clamp(18px, 5vw, 24px) !important;
	line-height: 1.15;
	margin: 0 !important;
	white-space: nowrap;
}
.director-player-count {
	flex: 0 0 auto;
	min-width: 0;
	gap: 5px;
	letter-spacing: .06em;
	white-space: nowrap;
}
.director-player-count strong {
	font-size: clamp(20px, 6vw, 26px) !important;
}
.director-player-count span {
	font-size: clamp(8px, 2.3vw, 10px);
}
.director-level-context {
	width: 100%;
	max-width: 100%;
	min-width: 0;
	display: grid !important;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	column-gap: 8px !important;
	box-sizing: border-box;
}
.director-level-context span {
	min-width: 0;
	font-size: clamp(8px, 2.5vw, 10px);
	letter-spacing: .035em;
	white-space: normal;
	overflow-wrap: anywhere;
}
.director-level-context span:last-child {
	text-align: right;
}



/* Preserve a safe gutter after the dashboard expands to viewport width. */
.director-dashboard {
	box-sizing: border-box !important;
	padding-left: 14px !important;
	padding-right: 14px !important;
}
.director-level-bar,
.director-progress,
.director-level-context,
.director-players {
	min-width: 0;
	box-sizing: border-box;
}
.director-level-context {
	padding-left: 2px;
	padding-right: 2px;
}
.director-section-heading {
	padding-left: 2px;
	padding-right: 2px;
	box-sizing: border-box;
}
@media (max-width: 700px) {
	.director-dashboard {
		padding-left: 12px !important;
		padding-right: 12px !important;
	}
	.director-level-context span {
		font-size: 8px !important;
		letter-spacing: 0 !important;
	}
	.director-player-count {
		gap: 4px !important;
		letter-spacing: .025em !important;
	}
}

	/* Slightly lift the player-list surface from the page background. */
	.director-player-list {
		background: #15181c !important;
	}


/* The full timer stays in normal flow. The compact copy is a separate overlay,
   so changing its size cannot alter the scroll geometry of the player list. */
.director-sticky-timer {
	position: relative;
	z-index: 1;
	background: #101214;
	padding: 0 0 8px;
}
.director-compact-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	z-index: 100;
	padding: 8px 14px;
	background: #101214;
	box-shadow: 0 5px 16px rgba(0,0,0,.35);
}
.director-compact-overlay .director-level-bar {
	grid-template-columns: 38px minmax(0, 1fr) 38px;
	gap: 6px;
}
.director-compact-overlay .level-arrow,
.director-compact-overlay .level-main {
	min-height: 62px;
	height: 62px;
	padding: 5px 8px;
	border-radius: 9px;
}
.director-compact-overlay .level-main {
	gap: 2px;
	flex-direction: row;
	flex-wrap: wrap;
	column-gap: 10px;
}
.director-compact-overlay .director-clock {
	font-size: 27px !important;
	line-height: 1;
}
.director-compact-overlay .director-blinds {
	font-size: 16px !important;
}
.director-compact-overlay .level-main strong {
	font-size: 14px !important;
}
.director-compact-overlay .director-progress {
	margin-top: 5px;
}
@media (max-width: 700px) {
	.director-compact-overlay { padding: 8px 12px; }
}


.install-app-button {
	flex: 0 1 auto;
	width: auto;
	min-width: 0;
	max-width: 100%;
	min-height: 36px;
	padding: 0 clamp(7px, 1.2vw, 11px);
	border: 1px solid #53645c;
	border-radius: 8px;
	background: #1b2922;
	color: #f4f4f1;
	font: inherit;
	font-size: clamp(10px, 0.9vw, 12px);
	font-weight: 700;
	line-height: 1.1;
	white-space: nowrap;
	cursor: pointer;
}
@media (max-width: 700px) {
	.header-actions > .install-app-button {
		flex: 0 0 auto !important;
		width: max-content !important;
		min-width: max-content !important;
		max-width: none !important;
		min-height: 40px !important;
		padding: 7px 12px !important;
		font-size: 12px !important;
		justify-self: start;
	}
}
.install-app-status {
	margin: 4px 14px 0;
	color: #b8c6bd;
	font-size: 12px;
	text-align: right;
}


/* Table-balancing recommendation toast */

	.table-balance-toast {
		position: fixed;
		right: 22px;
		bottom: 22px;
		z-index: 1200;
		width: min(440px, calc(100vw - 32px));
		padding: 15px 16px;
		border: 1px solid #59675e;
		border-radius: 12px;
		background: #20282a;
		color: #edf1ee;
		box-shadow: 0 14px 42px rgba(0, 0, 0, .42);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
	}
	.table-balance-toast-copy { min-width: 0; display: grid; gap: 4px; }
	.table-balance-toast-copy strong { color: #dce9df; font-size: 13px; }
	.table-balance-toast-copy span { color: #e8ece9; font-size: 12px; line-height: 1.4; }
	.table-balance-toast-copy small { color: #aab6ae; font-size: 10px; overflow-wrap: anywhere; }
	.table-balance-toast-actions { display: flex; flex: 0 0 auto; gap: 7px; }
	.table-balance-toast-actions button { min-height: 34px; padding: 7px 10px; border-radius: 7px; font-size: 11px; font-weight: 800; cursor: pointer; }
	.balance-toast-dismiss { border: 1px solid #4b555a; background: #2b3337; color: #d6ddda; }
	.balance-toast-accept { border: 1px solid #66816f; background: #365342; color: #f0f6f1; }
	@media (max-width: 600px) {
		.table-balance-toast { right: 12px; bottom: 12px; width: calc(100vw - 24px); align-items: flex-start; flex-direction: column; }
		.table-balance-toast-actions { align-self: flex-end; }
	}

</style>

