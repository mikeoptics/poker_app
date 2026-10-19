<script>
	import { onMount } from 'svelte';
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
	let buyInAmount = $state(20);
	let mixedGames = $state(false);
	// timer | tables | setup | payouts
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
	let tableView = $state('visual');
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

	const averageStack = $derived(0);

	/**
	 * @param {number} pot
	 */
	function calculatePayouts(pot) {
		const total = Math.max(0, Math.round(Number(pot) || 0));
		const entrants = players.length;

		if (total <= 0 || entrants === 0) return [];

		let places;

		if (entrants <= 3) {
			places = 1;
		} else if (entrants <= 6) {
			places = 2;
		} else if (entrants <= 10) {
			places = 3;
		} else if (entrants <= 15) {
			places = 4;
		} else if (entrants <= 20) {
			places = 5;
		} else if (entrants <= 30) {
			places = 6;
		} else {
			places = Math.ceil(entrants * 0.2);
		}

		places = Math.min(places, entrants);

		const weights = [0.4, 0.27, 0.18, 0.1, 0.05, 0.04, 0.03].slice(0, places);

		const weightTotal = weights.reduce((sum, value) => sum + value, 0);

		let amounts = weights.map((weight) => Math.floor((total * weight) / weightTotal / 10) * 10);

		amounts = amounts.map((amount) => Math.min(200, amount));

		let assigned = amounts.reduce((sum, amount) => sum + amount, 0);

		let remaining = total - assigned;

		while (remaining >= 10) {
			let changed = false;

			for (let i = 0; i < amounts.length && remaining >= 10; i += 1) {
				if (amounts[i] < 200) {
					amounts[i] += 10;
					remaining -= 10;
					changed = true;
				}
			}

			if (!changed) break;
		}

		while (remaining > 0 && places < entrants) {
			amounts.push(0);
			places += 1;

			if (remaining >= 10) {
				amounts[amounts.length - 1] = Math.min(200, remaining);

				remaining -= amounts[amounts.length - 1];
			}
		}

		return amounts.map((amount, index) => ({
			place: index + 1,
			amount
		}));
	}

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

	function start() {
		if (running || !currentBlinds) return;

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

		if (soundEnabled) playAlarm();

		if (announcementEnabled && currentLevel < levels.length - 1) {
			announceNextLevel();
		}

		transitionTimer = setTimeout(() => {
			transitionTimer = null;

			const next = currentLevel + 1;

			if (next < levels.length) {
				setLevel(next);
				start();
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

		if (p) p[field] += 1;
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
			const points = pointsForPlace(finishPlace);

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
		for (let index = 0; index < eliminated.length; index += 1) {
			eliminated[index].eliminationPosition = index + 1;
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

			const newPoints = pointsForPlace(player.eliminationPosition);

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
			const points = pointsForPlace(p.eliminationPosition);

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
			const newPoints = pointsForPlace(remainingPlayer.eliminationPosition ?? 1);
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
			redtoothPlayers = data.players.map(
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
			eliminationEvent, announcementEvent, venueName, updatedAt: Date.now()
		};
	}

	async function loadTournament() {
		const response = await fetch(`/api/tournament/${venueId}`);
		if (!response.ok) throw new Error('Unable to load this venue tournament.');
		const { state } = await response.json();
		if (!state) return;
		if (Array.isArray(state.levels) && state.levels.length) levels = state.levels;
		if (Array.isArray(state.players)) players = state.players;
		nextPlayerId = state.nextPlayerId ?? players.reduce((max, player) => Math.max(max, player.id), 0) + 1;
		currentLevel = Math.min(state.currentLevel ?? 0, levels.length - 1);
		levelDurationMs = state.levelDurationMs ?? levels[currentLevel].minutes * 60000;
		remainingMs = state.remainingMs ?? levelDurationMs;
		running = Boolean(state.running);
		soundEnabled = state.soundEnabled ?? true;
		announcementEnabled = state.announcementEnabled ?? true;
		buyInAmount = state.buyInAmount ?? 20;
		mixedGames = Boolean(state.mixedGames);
		activeTab = state.activeTab ?? 'timer';
		if (Array.isArray(state.redtoothPlayers)) redtoothPlayers = state.redtoothPlayers;
		eliminationEvent = state.eliminationEvent ?? null;
		announcementEvent = state.announcementEvent ?? null;
		venueName = state.venueName || venueName;
		redtoothSelectedVenue = { venueid: venueId, venuename: venueName, address1: '', address2: '', town: '', county: '', postcode: '', gamenight: '', distanceMiles: 0, active: '', lat: 0, lng: 0 };
		levelStartedAt = now() - (levelDurationMs - remainingMs);
		lastSavedSnapshot = JSON.stringify(state);
		if (running) {
			tournamentMode = currentBlinds?.break ? 'break' : 'play';
			frame = requestAnimationFrame(syncTimer);
		}
	}

	async function saveTournament() {
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
		loadTournament().catch((error) => console.error('Tournament load failed:', error));
		syncInterval = setInterval(() => {
			if (running) remainingMs = Math.max(0, levelStartedAt + levelDurationMs - now());
			saveTournament();
		}, 1000);
		refreshRedtooth();
		startRedtoothViewTimer();
		window.addEventListener('keydown', handleKeyboard);

		return () => {
			window.removeEventListener('keydown', handleKeyboard);
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
	<title>{venueName} · Mike's Poker App</title>
	<meta name="description" content="Mixed poker tournament timer, table manager and payouts" />
</svelte:head>

<div
	class="app"
	class:mode-play={running && !currentBlinds?.break}
	class:mode-break={running && currentBlinds?.break}
	class:mode-paused={!running}
>
	<header class="header">
		<div>
			<h2>Mike's Poker App</h2>
		</div>

		<div class="header-actions">
			<button class="sound" onclick={startCasting}>Cast to TV</button>
			<button class="sound" onclick={resetTournament}>Reset Tournament</button>
			<button class="sound" onclick={() => (soundEnabled = !soundEnabled)}>
				{soundEnabled ? '🔊 Alarm' : '🔇 Alarm off'}
			</button>

			<button class="sound" onclick={() => (announcementEnabled = !announcementEnabled)}>
				{announcementEnabled ? '🗣️ Announce' : '🔇 Announce off'}
			</button>

			<button class="clock-button" onclick={() => (showClock ? closeClock() : startClock())}>
				⏱ Call the Clock
			</button>
			{#if castStatus}<span class="cast-status">{castStatus}</span>{/if}
		</div>
	</header>

	<nav class="tabs" aria-label="Tournament sections">
		<button class:active={activeTab === 'timer'} onclick={() => (activeTab = 'timer')}>
			Timer
		</button>

		<button class:active={activeTab === 'tables'} onclick={() => (activeTab = 'tables')}>
			Seating
		</button>

		<button class:active={activeTab === 'setup'} onclick={() => (activeTab = 'setup')}>
			Setup & Players
		</button>

		<button class:active={activeTab === 'payouts'} onclick={() => (activeTab = 'payouts')}>
			Payouts
		</button>
	</nav>

	<main>
		{#if activeTab === 'timer'}
			<section class="director-dashboard">
				<div class="director-level-bar">
					<button class="level-arrow" aria-label="Previous blind level" onclick={previousLevel} disabled={currentLevel === 0}>◀</button>
					<button class="level-main" onclick={toggleTimer} aria-label={running ? 'Pause tournament timer' : 'Resume tournament timer'}>
						<span class="director-eyebrow">LEVEL {currentLevel + 1} OF {levels.length} · {running ? 'RUNNING' : 'PAUSED'}</span>
						<strong>{currentBlinds?.break ? 'BREAK' : currentGame}</strong>
						<span class="director-blinds">{#if currentBlinds?.break}{currentBlinds.minutes} MINUTES{:else}{currentBlinds?.sb} / {currentBlinds?.bb}{/if}</span>
						<span class="director-clock">{formattedTime}</span>
						<span class="director-hint">TAP TO {running ? 'PAUSE' : 'START'}</span>
					</button>
					<button class="level-arrow" aria-label="Next blind level" onclick={nextLevel} disabled={currentLevel >= levels.length - 1}>▶</button>
				</div>
				<div class="director-progress"><div style={`width:${progress}%`}></div></div>
				<div class="director-level-context">
					<span>PREVIOUS: {#if previousBlinds}{previousBlinds.break ? 'BREAK' : `${previousBlinds.sb} / ${previousBlinds.bb}`}{:else}—{/if}</span>
					<span>NEXT: {#if nextBlinds}{nextBlinds.break ? 'BREAK' : `${nextBlinds.sb} / ${nextBlinds.bb}`}{:else}—{/if}</span>
				</div>
				<section class="director-players">
					<div class="director-section-heading">
						<div><span class="director-eyebrow">TOURNAMENT DIRECTOR</span><h1>Players</h1></div>
						<div class="director-player-count"><strong>{activePlayerCount}</strong><span>ACTIVE</span></div>
					</div>
					<form class="director-add-player" onsubmit={(e) => { e.preventDefault(); addPlayerFromForm(); }}>
						<div class="redtooth-autocomplete">
							<input value={newPlayerName} placeholder="Add player…" autocomplete="off" oninput={(e) => { newPlayerName = e.currentTarget.value; redtoothSelectedPlayer = null; searchRedtooth(e.currentTarget.value); }} />
							{#if redtoothSearchResults.length > 0}
								<div class="redtooth-search-results">
									{#each redtoothSearchResults as result}
										<button type="button" class="redtooth-search-result" onclick={() => selectRedtoothPlayer(result)}><span><strong>{result.name}</strong><small>{result.games} games · {result.points} pts</small></span><span class="redtooth-search-position">#{result.position}</span></button>
									{/each}
								</div>
							{/if}
						</div>
						<button class="director-add-button" type="submit">+ ADD</button>
					</form>
					{#if activePlayers.length === 0 && eliminatedPlayers.length === 0}
						<div class="director-empty">Add players above to start managing the tournament.</div>
					{:else}
						<div class="director-player-list">
							{#each activePlayers as player (player.id)}
								<div class="director-player-row">
									<div class="director-player-identity"><strong>{player.name}</strong><span>{player.guest ? 'GUEST' : player.redtoothId !== null ? 'REDTOOTH' : 'UNLINKED'} · TABLE {player.table} / SEAT {player.seat}</span></div>
									<button class="eliminate-button" onclick={() => removePlayer(player.id)}>ELIMINATE</button>
								</div>
							{/each}
						</div>
						{#if eliminatedPlayers.length > 0}
							<div class="director-eliminated-heading">ELIMINATED · {eliminatedPlayers.length}</div>
							<div class="director-player-list eliminated-list">
								{#each [...eliminatedPlayers].sort((a, b) => (b.eliminationPosition ?? 0) - (a.eliminationPosition ?? 0)) as player (player.id)}
									<div class="director-player-row is-eliminated">
										<div class="director-player-identity"><strong>{player.name}</strong><span>{player.eliminationPosition}{player.eliminationPosition === 1 ? 'ST' : player.eliminationPosition === 2 ? 'ND' : player.eliminationPosition === 3 ? 'RD' : 'TH'} PLACE</span></div>
										<div class="director-eliminated-actions">
											<button class="restore-button" onclick={() => restorePlayer(player.id)}>UNDO ELIMINATION</button>
											<div class="elimination-order-controls">
												<button class="order-button" title="Improve finishing position" onclick={() => moveEliminatedPlayer(player.id, -1)}>▲</button>
												<button class="order-button" title="Lower finishing position" onclick={() => moveEliminatedPlayer(player.id, 1)}>▼</button>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					{/if}
				</section>
			</section>
		{:else if activeTab === 'tables'}
			<Tables
				bind:tableView
				{activePlayerCount}
				{eliminatedPlayers}
				{balanceMessage}
				{balanceSuggestions}
				{activePlayers}
				{tableCount}
				{isFinalTable}
				{finalSeats}
				{seats}
				{seatRole}
				{removePlayer}
				{applyBalance}
			/>
			```svelte
		{:else if activeTab === 'setup'}
			<div class="setup-layout">
				<!-- LEFT: BLIND STRUCTURE -->
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

				<!-- RIGHT: TOURNAMENT SETTINGS -->
				<div class="setup-sidebar">
					<section class="location-card">
						<div class="section-heading"><div><span class="label">VENUE</span><h2>{venueName}</h2></div><a class="sound" href="/">Change venue</a></div>
						<p class="venue-id-note">Venue ID: {venueId}</p>
					</section>

					<!-- TOURNAMENT SETTINGS -->
					<section class="setup-card tournament-settings-card">
						<div class="section-heading">
							<div>
								<span class="label">TOURNAMENT</span>
								<h2>Buy In</h2>
							</div>
						</div>

						<div class="setup-grid">
							<div class="setup-fields">
								<label>
									Entry Cost (£)

									<input type="number" min="10" step="5" bind:value={buyInAmount} />
								</label>
							</div>
						</div>
					</section>

					<!-- PLAYERS -->
					<section class="setup-card players-card">
						<div class="section-heading setup-heading">
							<div>
								<span class="label">TOURNAMENT</span>
								<h2>Players</h2>
							</div>
						</div>

						<form
							class="add-player-form"
							onsubmit={(e) => {
								e.preventDefault();
								addPlayerFromForm();
							}}
						>
							<label class="redtooth-player-input">
								<span>Player name</span>

								<div class="redtooth-autocomplete">
									<input
										value={newPlayerName}
										placeholder="Enter player name"
										autocomplete="off"
										oninput={(e) => {
											newPlayerName = e.currentTarget.value;

											redtoothSelectedPlayer = null;

											searchRedtooth(e.currentTarget.value);
										}}
									/>

									{#if redtoothSearchResults.length > 0}
										<div class="redtooth-search-results">
											{#each redtoothSearchResults as result}
												<button
													type="button"
													class="redtooth-search-result"
													onclick={() => selectRedtoothPlayer(result)}
												>
													<span>
														<strong>
															{result.name}
														</strong>

														<small>
															{result.games}
															games ·
															{result.points}
															pts
														</small>
													</span>

													<span class="redtooth-search-position">
														#{result.position}
													</span>
												</button>
											{/each}
										</div>
									{/if}
								</div>
							</label>

							<button class="primary add-player-submit" type="submit"> + Add Player </button>

							<button
								class="secondary gridspan2 randomise-seats"
								type="button"
								onclick={randomiseSeats}
							>
								Randomly assign seats
							</button>
						</form>

						<div class="player-list setup-list">
							<div class="list-header">
								<h3>Seating & entries</h3>

								<span>
									{activePlayerCount}
									active ·
									{players.length}
									players ·
									{totalEntries}
									entries
								</span>
							</div>

							{#each players as player}
								<div class:eliminated={player.eliminated} class="player-row">
									<input
										value={player.name}
										onchange={(e) => updatePlayerName(player.id, e.currentTarget.value)}
									/>

									{#if player.redtoothId != null}
										<span class="redtooth-linked"> ✓ Redtooth </span>
									{:else if !player.guest}
										<span class="redtooth-unlinked"> ✗ Redtooth </span>
									{:else}
										<span class="redtooth-guest"> Guest </span>
									{/if}

									<span>
										{player.eliminated ? 'ELIMINATED' : `Table ${player.table}`}
									</span>

									<span class="player-position">
										{#if player.eliminated}
											{player.eliminationPosition === 1
												? '1st'
												: player.eliminationPosition === 2
													? '2nd'
													: player.eliminationPosition === 3
														? '3rd'
														: `${player.eliminationPosition}th`}

											<div class="elimination-order-controls">
												<button
													class="order-button"
													disabled={player.eliminationPosition === 1}
													title="Move one place earlier"
													onclick={() => moveEliminatedPlayer(player.id, -1)}
												>
													↑
												</button>

												<button
													class="order-button"
													disabled={player.eliminationPosition === eliminatedCount}
													title="Move one place later"
													onclick={() => moveEliminatedPlayer(player.id, 1)}
												>
													↓
												</button>
											</div>
										{:else}
											Seat {player.seat}
										{/if}
									</span>

									<button
										class:paid={player.paid}
										class="paid-button"
										onclick={() => togglePaid(player.id)}
									>
										{player.paid ? '✓ Paid' : 'Unpaid'}
									</button>

									<button
										class="tiny"
										disabled={player.eliminated}
										onclick={() => changeEntry(player.id, 'rebuys')}
									>
										+ Rebuy ({player.rebuys})
									</button>

									<button
										class="tiny"
										disabled={player.eliminated}
										onclick={() => removeEntry(player.id, 'rebuys')}
									>
										−
									</button>

									<button
										class="tiny"
										disabled={player.eliminated}
										onclick={() => changeEntry(player.id, 'topUps')}
									>
										+ Top-up ({player.topUps})
									</button>

									<button
										class="tiny"
										disabled={player.eliminated}
										onclick={() => removeEntry(player.id, 'topUps')}
									>
										−
									</button>
								</div>
							{:else}
								<p class="empty">No players added yet.</p>
							{/each}
						</div>
					</section>
				</div>
			</div>
			```

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

					<div class="money-stat">
						<span>BUY-IN</span>
						<strong>
							£{buyInAmount}
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
							£{payouts.reduce((sum, p) => sum + p.amount, 0).toLocaleString('en-GB')}
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
	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		background: #101214;
		color: #f4f4f1;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}

	:global(button),
	:global(input),
	:global(select) {
		font: inherit;
	}

	.app {
		height: 100dvh;
		min-height: 100dvh;
		padding: 18px 22px 8px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		transition:
			background-color 0.45s ease,
			background 0.45s ease;
		background:
			radial-gradient(circle at top, rgba(255, 255, 255, 0.06), transparent 32rem), #101214;
	}

	.header,
	main,
	.tabs {
		width: min(1400px, 100%);
		margin-left: auto;
		margin-right: auto;
	}

	.header {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 14px;
	}

	main {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.tabs {
		order: 10;
		flex: 0 0 auto;
		margin-top: 8px;
	}

	.header-actions {
		display: flex;
		gap: 7px;
		flex-wrap: wrap;
	}

	.label {
		color: #8f969d;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		margin: 0 0 5px;
	}

	h1,
	h2,
	h3 {
		margin: 0;
	}

	h1 {
		font-size: clamp(1.8rem, 4vw, 3rem);
		letter-spacing: -0.045em;
	}

	h2 {
		font-size: 1.35rem;
	}

	h3 {
		font-size: 1rem;
	}

	button {
		border: 0;
		cursor: pointer;
	}

	.sound,
	.add,
	.clock-button {
		border: 1px solid #343a40;
		background: #181b1f;
		color: #e8eaec;
		padding: 8px 11px;
		border-radius: 9px;
	}

	.clock-button {
		background: #e7e9ea;
		color: #101214;
		font-weight: 800;
	}

	.tabs {
		display: flex;
		gap: 4px;
		border-top: 1px solid #292e34;
		padding-top: 5px;
		margin-bottom: 0;
	}

	.tabs button {
		padding: 9px 14px;
		background: transparent;
		color: #7f878e;
		border-bottom: 2px solid transparent;
	}

	.tabs button.active {
		color: #f4f4f1;
		border-color: #f4f4f1;
	}

	.mode-play {
		background: #053029;
	}

	.mode-break {
		background: #641919;
	}

	.mode-paused {
		background: #173c62;
	}

	/* =========================
     TIMER TAB
     ========================= */
	.tournament-player-list .redtooth-row.eliminated {
		opacity: 0.42;
		color: #777d82;
	}

	.tournament-player-list .redtooth-row.eliminated .redtooth-position,
	.tournament-player-list .redtooth-row.eliminated .redtooth-player-name span,
	.tournament-player-list .redtooth-row.eliminated .redtooth-games,
	.tournament-player-list .redtooth-row.eliminated .redtooth-points {
		color: #777d82;
		text-decoration: line-through;
	}

	.tournament-player-list .redtooth-row.eliminated .redtooth-player-name small {
		color: #777d82;
		text-decoration: none;
	}

	.timer-display {
		position: relative;
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: clamp(20px, 3vh, 42px) clamp(24px, 4vw, 80px);
		overflow: hidden;
	}

	.mixed-toggle {
		border: 1px solid #343a40;
		background: #181b1f;
		color: #e8eaec;
		padding: 8px 11px;
		border-radius: 9px;
		font-weight: 700;
	}

	.mixed-toggle:hover {
		background: #24292f;
	}

	.game-display {
		text-align: center;
		margin-top: 4em;
	}
	.game-display-empty {
		visibility: hidden;
	}
	.game-display .display-label,
	.display-info .display-label {
		display: block;
		font-size: clamp(0.65rem, 1vw, 0.95rem);
		font-weight: 800;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.game-display h1 {
		margin: clamp(4px, 0.8vh, 10px) 0 0;
		font-size: 5rem;
		line-height: 0.9;
		font-weight: 800;
		letter-spacing: 0em;
		color: burlywood;
		text-transform: uppercase;
	}

	.clock-display {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		min-height: 0;
		width: 100%;
	}

	.clock {
		line-height: 0.78;
		font-weight: 800;
		letter-spacing: 0.1rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: white;
		font-size: 12rem;
	}

	.blinds-display {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: clamp(10px, 1.5vw, 24px);
		margin-top: clamp(18px, 3vh, 32px);
		font-size: 5em;
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.blind-divider {
		color: var(--muted);
		font-weight: 400;
	}

	.break-text {
		font-size: clamp(2.5rem, 5vw, 5rem);
		font-weight: 900;
		letter-spacing: 0.08em;
	}

	.progress-display {
		width: min(900px, 80%);
		height: clamp(5px, 0.5vh, 8px);
		margin: clamp(25px, 4vh, 45px) 0;
		overflow: hidden;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
	}

	.progress-display-fill {
		height: 100%;
		border-radius: inherit;
		background: var(--accent, #62d394);
		transition: width 0.3s linear;
	}

	.display-info {
		width: min(900px, 100%);
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: clamp(20px, 4vw, 60px);
		padding: clamp(14px, 2vh, 24px) 0;
	}

	.info-block {
		text-align: center;
	}

	.info-block strong {
		display: block;
		margin-top: 7px;
		font-size: clamp(1.3rem, 2.5vw, 2.5rem);
		font-weight: 800;
		line-height: 1;
	}

	.info-block small {
		display: block;
		margin-top: 7px;
		font-size: clamp(0.75rem, 1.2vw, 1.1rem);
		color: var(--muted);
	}

	.info-divider {
		width: 1px;
		height: 55px;
		background: rgba(255, 255, 255, 0.12);
	}

	.next-level strong {
		text-transform: uppercase;
	}

	.primary {
		min-width: 130px;
		background: #f4f4f1;
		color: #101214;
		font-size: 1rem;
		font-weight: 800;
	}

	.secondary {
		width: 46px;
		background: #24292f;
		color: #f4f4f1;
		font-size: 1.3rem;
		border-radius: 9px;
	}

	/* =========================
     SETUP
     ========================= */

	.setup-layout {
		height: 100%;
		display: grid;
		grid-template-columns: minmax(430px, 0.9fr) minmax(560px, 1.4fr);
		gap: 14px;
		min-height: 0;
	}

	.setup-sidebar {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}

	.levels-card,
	.setup-card,
	.payout-card,
	.location-card {
		background: #17191b;
		border: 1px solid #292d30;
		border-radius: 14px;
		color: #f2f3f4;
		box-sizing: border-box;
	}

	.levels-card,
	.location-card,
	.tournament-settings-card {
		padding: 15px;
	}

	.setup-card,
	.payout-card {
		padding: 20px;
		min-height: 0;
		overflow: hidden;
	}

	.setup-card {
		padding: 20px;
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
	}

	.setup-layout .levels-card {
		overflow: hidden;
	}
	/* Make the players card substantially wider */
	.setup-sidebar .players-card {
		width: 100%;
	}
	.setup-layout .table {
		overflow: auto;
		max-height: calc(100dvh - 190px);
	}

/* On smaller screens, stack the two columns */
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
	@media (max-width: 700px) {
		.setup-sidebar {
			display: flex;
			flex-direction: column;
			gap: 18px;
		}
		.setup-layout {
			display: flex;
			flex-direction: column;
			gap: 18px;
		}
	}
.players-card {
		padding: 18px;
		flex: 1 1 auto;
		min-height: 0;
	}

	.compact-levels .section-heading {
		margin-bottom: 9px;
	}

	.table {
		width: 100%;
		overflow-x: hidden;
	}

	.table-row {
		display: grid;
		grid-template-columns: 45px minmax(0, 1.3fr) repeat(3, minmax(0, 1fr)) 30px;
		gap: 6px;
		align-items: center;
		width: 100%;
		padding: 5px;
		border-radius: 8px;
	}

	.table-row.no-game-column {
		grid-template-columns: 45px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 30px;
	}

	.table-row input,
	.table-row select {
		width: 100%;
		min-width: 0;
		padding: 7px;
		border: 1px solid #343a40;
		border-radius: 6px;
		background: #111316;
		color: #f4f4f1;
	}

	.redtooth-panel.league-view {
		border-color: #71363b;
		box-shadow:
			0 4px 16px rgba(0, 0, 0, 0.06),
			0 0 0 1px rgba(113, 54, 59, 0.18);
	}

	.redtooth-panel.today-view {
		border-color: #526779;
		box-shadow:
			0 4px 16px rgba(0, 0, 0, 0.06),
			0 0 0 1px rgba(82, 103, 121, 0.18);
	}

	.redtooth-mode-description {
		margin: 2px 0 0;
		color: #7d848a;
		font-size: 0.65rem;
		font-weight: 600;
	}

	.redtooth-content {
		flex: 1 1 0;
		min-height: 0;
		height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: redtoothViewIn 0.65s ease;
	}

	.redtooth-list {
		flex: 1 1 0;
		min-height: 0;
		overflow-y: auto;
	}

	.redtooth-content.show-tournament {
		animation-name: redtoothViewIn;
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
		.redtooth-panel,
		.redtooth-content {
			animation: none;
			transition: none;
		}
	}

	.table-row select {
		cursor: pointer;
		appearance: auto;
	}

	.table-row select option {
		background: #111316;
		color: #f4f4f1;
	}

	.table-row.active {
		background: #24292f;
	}

	.break-row {
		background: #5b1717 !important;
		color: #fff;
	}

	.table-head {
		color: #777f87;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.table-row input {
		width: 100%;
		min-width: 0;
		padding: 7px;
		border: 1px solid #343a40;
		border-radius: 6px;
		background: #111316;
		color: #f4f4f1;
	}

	.level-button {
		background: transparent;
		color: #f4f4f1;
		text-align: left;
		padding: 7px;
		font-size: 0.75rem;
	}

	.delete {
		background: transparent;
		color: #777f87;
		font-size: 1.1rem;
	}

	.setup-grid {
		display: flex;
		gap: 14px;
		margin-top: 15px;
	}

	.setup-fields {
		display: grid;
		grid-template-columns: 150px 170px 1fr;
		gap: 8px;
	}

	.setup-fields label,
	.add-player-form label {
		display: block;
		color: #8f969d;
		font-size: 0.7rem;
		font-weight: 800;
		text-transform: uppercase;
		flex: 1;
	}

	.setup-fields input,
	.add-player-form input,
	.player-row input {
		display: block;
		width: 100%;
		margin-top: 5px;
		padding: 9px;
		border: 1px solid #343a40;
		border-radius: 7px;
		background: #111316;
		color: #f4f4f1;
	}

	.add-player-form label {
		min-width: 0;
	}

	.add-player-form input {
		min-width: 0;
	}

	.add-player-submit {
		height: 39px;
		min-width: 130px;
		background: #f4f4f1;
		color: #101214;
		font-size: 1rem;
		font-weight: 800;
		border-radius: 9px;
	}

	.randomise-seats {
		font-size: 1rem;
		height: 39px;
		white-space: nowrap;
		flex: 1 0 auto;
	}

	.player-list {
		flex: 1 1 auto;
		min-height: 0;
		margin-top: 14px;
		overflow-y: auto;
		padding: 0 8px 24px 0;
	}

	.list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}

	.list-header span {
		color: #8f969d;
		font-size: 0.75rem;
	}

	.player-row {
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
	}

	.player-row input {
		margin: 0;
		min-width: 0;
		max-width: 170px;
	}

	.player-row span {
		color: #8f969d;
		font-size: 0.7rem;
		white-space: nowrap;
	}

	.paid-button {
		padding: 5px 8px;
		border-radius: 5px;
		background: #5a2020;
		color: #ffb0b0;
		font-size: 0.65rem;
		font-weight: 800;
		white-space: nowrap;
	}

	.paid-button.paid {
		background: #214b36;
		color: #a8e6be;
	}

	.player-row.eliminated {
		opacity: 0.45;
	}

	.player-row.eliminated input {
		text-decoration: line-through;
	}

	.tiny {
		padding: 5px 6px;
		border-radius: 5px;
		background: #24292f;
		color: #dfe3e6;
		font-size: 0.6rem;
	}

	.empty {
		color: #858d95;
		font-size: 0.78rem;
		margin-top: 15px;
	}

	/* =========================
     PAYOUTS
     ========================= */

	.payout-card {
		max-width: 760px;
	}

	.pot-total {
		font-size: 2rem;
		font-weight: 800;
	}

	.money-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		margin-top: 15px;
	}

	.money-stat {
		padding: 13px;
		border: 1px solid #292e34;
		border-radius: 9px;
		background: #121518;
	}

	.money-stat span {
		display: block;
		color: #8f969d;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.08em;
	}

	.money-stat strong {
		display: block;
		margin-top: 3px;
		font-size: 1.15rem;
	}

	.payout-section {
		margin-top: 22px;
		border-top: 1px solid #292e34;
		padding-top: 18px;
	}

	.total-percent {
		font-weight: 800;
	}

	.payout-row {
		display: grid;
		grid-template-columns: 55px 1fr 25px 120px;
		align-items: center;
		gap: 8px;
		padding: 9px 0;
		border-bottom: 1px solid #292e34;
	}

	.payout-row b {
		text-align: right;
	}
	.redtooth-linked {
		color: #63b982 !important;
	}

	.redtooth-unlinked {
		color: #d46b6b !important;
	}
	/* =========================
     CLOCK MODAL
     ========================= */

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.76);
		backdrop-filter: blur(5px);
		display: grid;
		place-items: center;
		z-index: 100;
	}

	.clock-modal {
		position: relative;
		width: min(430px, calc(100vw - 30px));
		padding: 34px;
		border: 1px solid #444b51;
		border-radius: 20px;
		background: #171a1e;
		text-align: center;
		box-shadow: 0 30px 100px rgba(0, 0, 0, 0.55);
	}

	.modal-close {
		position: absolute;
		right: 12px;
		top: 8px;
		background: transparent;
		color: #8f969d;
		font-size: 1.7rem;
	}

	.call-clock-number {
		font-size: clamp(7rem, 25vw, 11rem);
		font-weight: 900;
		line-height: 0.95;
		letter-spacing: -0.08em;
		margin: 20px 0 8px;
		font-variant-numeric: tabular-nums;
	}

	.clock-modal p {
		color: #8f969d;
		margin: 0 0 22px;
	}

	.clock-controls {
		display: flex;
		justify-content: center;
		gap: 8px;
	}

	.clock-controls .secondary {
		width: auto;
		padding: 0 18px;
		font-size: 0.9rem;
	}

	.strobe .call-clock-number {
		animation: clockPulse 0.55s steps(2, end) infinite;
	}

	@keyframes clockPulse {
		50% {
			opacity: 0.58;
			transform: scale(1.025);
		}
	}

	/* =========================
     RESPONSIVE
     ========================= */

	@media (max-width: 1050px) {
		.setup-layout {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.app {
			padding: 14px;
		}

		.header {
			display: block;
		}

		.header-actions {
			margin-top: 10px;
		}

		.tabs {
			overflow-x: auto;
		}

		.setup-fields {
			grid-template-columns: 1fr 1fr;
		}

		.money-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.player-row {
			grid-template-columns:
				1fr
				80px
				80px;
		}

		.player-row span,
		.player-row .tiny {
			font-size: 0.6rem;
		}
	}

	@media (max-width: 500px) {
		h1 {
			font-size: 1.65rem;
		}

		.levels-card,
		.setup-card,
		.payout-card {
			padding: 13px;
		}

		.setup-fields {
			grid-template-columns: 1fr;
		}

		.clock {
			font-size: 4.5rem;
		}

		.player-row {
			grid-template-columns: 1fr 1fr;
		}

		.player-row input {
			grid-column: 1 / -1;
		}

		.payout-row {
			grid-template-columns: 45px 80px 20px 1fr;
		}
	}
	/* Timer + Redtooth two-column layout */
	.timer-page-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 360px;
		gap: 20px;
		align-items: start;
		width: 100%;
	}

	.timer-page-layout > .timer-display {
		min-width: 0;
	}

	/* Redtooth league panel */
	.redtooth-panel {
		border: 1px solid #d9dde1;
		border-radius: 14px;
		padding: 18px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
		min-width: 0;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		color: #202428;
		background: #ffffff;
		transition:
			border-color 0.6s ease,
			box-shadow 0.6s ease;
	}

	.redtooth-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding-bottom: 14px;
		border-bottom: 1px solid #e1e4e7;
		color: #555b61;
	}

	.redtooth-header h2 {
		margin: 3px 0 0;
		font-size: 20px;
		line-height: 1.1;
		color: #202428;
	}
	.redtooth-controls {
		display: flex;
		gap: 5px;
		flex: 0 0 auto;
	}

	.redtooth-control {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid #c7cbd0;
		border-radius: 7px;
		background: #f1f2f3;
		color: #596168;
		font-size: 0.72rem;
		font-weight: 800;
		cursor: pointer;
		transition:
			background 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
	}

	.redtooth-control:hover {
		background: #e4e6e8;
		border-color: #aeb4b9;
		color: #292e32;
	}

	.redtooth-column-head {
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr) 36px 52px;
		gap: 8px;
		padding: 10px 8px 7px;
		color: #7a8086;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.redtooth-column-head span:nth-child(3),
	.redtooth-column-head span:nth-child(4) {
		text-align: right;
	}

	.redtooth-list {
		overflow-y: auto;
		min-height: 0;
		padding-right: 3px;
	}

	.redtooth-row {
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr) 36px 52px;
		gap: 8px;
		align-items: center;
		min-height: 42px;
		padding: 5px 8px;
		border-radius: 7px;
		border-left: 3px solid transparent;
	}

	.redtooth-row:hover {
		background: #f4f5f6;
	}

	.redtooth-row.regional {
		border-left-color: #2e9b57;
	}

	.redtooth-row.playoff {
		border-left-color: #d49a27;
	}

	.redtooth-position {
		font-weight: 700;
		font-size: 13px;
		color: #202428;
	}

	.redtooth-player-name {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.redtooth-player-name span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		font-weight: 600;
		color: #202428;
	}

	.redtooth-player-name small {
		margin-top: 1px;
		color: #c47a18;
		font-size: 10px;
		font-weight: 600;
		color: #9a6919;
	}

	.redtooth-games {
		text-align: right;
		color: #3f464c;
		font-size: 12px;
	}

	.redtooth-points {
		text-align: right;
		color: #16703d;
		font-size: 14px;
		font-weight: 800;
	}

	.redtooth-points.pending-points {
		color: #9a6919;
	}

	.redtooth-boundary {
		margin: 7px 0 3px;
		padding: 5px 8px;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.08em;
		border-radius: 5px;
	}

	.redtooth-boundary.regional-boundary {
		background: #e8f5ed;
		color: #287c48;
	}

	.redtooth-boundary.playoff-boundary {
		background: #fff4df;
		color: #9a6919;
	}

	.redtooth-error {
		margin-top: 14px;
		padding: 10px 12px;
		border-radius: 8px;
		background: #fff0f0;
		color: #a33a3a;
		font-size: 12px;
	}

	.redtooth-empty {
		padding: 30px 10px;
		text-align: center;
		color: #555b61;
		font-size: 13px;
	}

	.redtooth-updated {
		padding-top: 10px;
		border-top: 1px solid #e1e4e7;
		color: #555b61;
		font-size: 10px;
		text-align: right;
		flex-shrink: 0;
	}

	@media (max-width: 1100px) {
		.timer-page-layout {
			grid-template-columns: minmax(0, 1fr) 310px;
			gap: 14px;
		}

		.redtooth-panel {
			padding: 14px;
		}
	}

	@media (max-width: 850px) {
		.timer-page-layout {
			grid-template-columns: 1fr;
		}

		.redtooth-panel {
			max-height: 500px;
		}
	}

	.add-player-form {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.redtooth-player-input {
		margin-top: 10px;
		display: block;
	}

	.redtooth-autocomplete {
		position: relative;
	}

	.redtooth-search-results {
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
	}

	.redtooth-search-result {
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
	}

	.redtooth-search-result:last-child {
		border-bottom: 0;
	}

	.redtooth-search-result:hover {
		background: #2b3137;
	}

	.redtooth-search-result strong {
		display: block;
		color: #f4f4f1;
		font-size: 13px;
	}

	.redtooth-search-result small {
		display: block;
		margin-top: 2px;
		color: #aeb5bb;
		font-size: 10px;
	}

	.redtooth-search-position {
		flex-shrink: 0;
		color: #7ed39b;
		font-size: 12px;
		font-weight: 800;
	}

	.venue-id-note, .cast-status { color: #9aa1a8; font-size: 0.72rem; margin-top: 8px; }

.level-actions {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 8px;
		margin: 4px 0;
	}

	.add-level-after,
	.add-break {
		border: 0;
		background: transparent;
		font-size: 0.65rem;
		font-weight: 700;
		cursor: pointer;
		padding: 4px 8px;
	}

	.add-level-after {
		color: #8a9197;
	}

	.add-level-after:hover {
		color: #d0d4d7;
	}

	.add-break {
		color: #a85b60;
	}

	.add-break:hover {
		color: #d37a80;
	}

	.player-position {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.elimination-order-controls {
		display: flex;
		gap: 2px;
	}

	.order-button {
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
	}

	.order-button:hover:not(:disabled) {
		background: #303438;
		color: #fff;
	}

	.order-button:disabled {
		opacity: 0.25;
		cursor: default;
	}

	/* Tournament Director: black and gold control surface */
	.app, .mode-play, .mode-break, .mode-paused {
		background: radial-gradient(circle at 50% -20%, rgba(196,163,106,.12), transparent 38rem), #0b0c0e !important;
		color: #f4f0e7;
	}
	.header h2 { color: #c4a36a; letter-spacing: .04em; }
	.header { border-bottom: 1px solid rgba(196,163,106,.2); padding-bottom: 12px; }
	.sound, .add, .clock-button, .tabs button, .secondary, .mixed-toggle {
		background: #171717; color: #d8c49c; border: 1px solid #5a482b; border-radius: 8px;
	}
	.clock-button, .tabs button.active { background: #c4a36a; color: #111; border-color: #c4a36a; }
	.tabs { border-color: rgba(196,163,106,.25); }
	.tabs button.active { border-bottom-color: #c4a36a; }
	.levels-card, .setup-card, .payout-card, .location-card, .table-card, .director-players {
		background: #141414; border: 1px solid #403522; border-radius: 14px; color: #f4f0e7;
	}
	.primary { background: #c4a36a; color: #111; border-radius: 8px; }
	input, select { background: #0c0d0e; color: #f4f0e7; border: 1px solid #51432c; border-radius: 7px; }
	.director-dashboard { height:100%; min-height:0; overflow:auto; padding: 0 0 22px; }
	.director-level-bar { display:grid; grid-template-columns:56px minmax(0,1fr) 56px; gap:10px; align-items:stretch; max-width:900px; margin:0 auto; }
	.level-arrow { border:1px solid #6b5732; border-radius:12px; background:#171512; color:#c4a36a; font-size:22px; font-weight:900; min-height:150px; touch-action:manipulation; }
	.level-arrow:disabled { opacity:.25; }
	.level-main { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; min-height:150px; padding:14px; border:1px solid #80683b; border-radius:12px; background:linear-gradient(145deg,#211d15,#111); color:#f4f0e7; touch-action:manipulation; }
	.director-eyebrow { color:#c4a36a; font-size:10px; font-weight:900; letter-spacing:.18em; }
	.level-main strong { color:#f3e5c5; font-size:clamp(20px,3vw,30px); letter-spacing:.08em; }
	.director-blinds { color:#c4a36a; font-size:clamp(21px,4vw,34px); font-weight:900; font-variant-numeric:tabular-nums; }
	.director-clock { color:#fff; font-size:clamp(34px,7vw,58px); line-height:1; font-weight:900; font-variant-numeric:tabular-nums; }
	.director-hint { color:#95876e; font-size:9px; letter-spacing:.16em; font-weight:800; }
	.director-progress { height:4px; max-width:850px; margin:9px auto 0; background:#29251e; border-radius:9px; overflow:hidden; }
	.director-progress div { height:100%; background:#c4a36a; transition:width .25s linear; }
	.director-level-context { display:flex; justify-content:space-between; gap:12px; max-width:850px; margin:8px auto 18px; color:#8f8779; font-size:10px; font-weight:800; letter-spacing:.08em; }
	.director-players { max-width:900px; margin:0 auto; padding:16px; }
	.director-section-heading { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
	.director-section-heading h1 { color:#f4f0e7; font-size:24px; margin-top:3px; }
	.director-player-count { display:flex; align-items:center; gap:7px; color:#c4a36a; font-size:10px; font-weight:800; letter-spacing:.12em; }
	.director-player-count strong { font-size:26px; }
	.director-add-player { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; margin-bottom:12px; }
	.director-add-player input { width:100%; min-height:44px; padding:10px 12px; font-size:16px; }
	.director-add-button { min-width:86px; border-radius:8px; background:#c4a36a; color:#111; font-size:12px; font-weight:900; padding:0 14px; }
	.director-player-list { display:flex; flex-direction:column; gap:6px; }
	.director-player-row { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:58px; padding:9px 10px; border:1px solid #30291e; border-radius:9px; background:#191817; }
	.director-player-identity { display:flex; flex-direction:column; min-width:0; gap:4px; }
	.director-player-identity strong { overflow-wrap:anywhere; color:#f2eee5; font-size:14px; }
	.director-player-identity span { color:#8f8779; font-size:9px; font-weight:800; letter-spacing:.08em; }
	.eliminate-button, .restore-button { min-height:38px; border-radius:7px; padding:0 12px; background:#3b2020; border:1px solid #704040; color:#f2b5a9; font-size:10px; font-weight:900; letter-spacing:.06em; touch-action:manipulation; }
	.director-eliminated-heading { margin:18px 0 8px; color:#c4a36a; font-size:10px; font-weight:900; letter-spacing:.16em; }
	.is-eliminated { opacity:.7; }
	.is-eliminated .director-player-identity strong { text-decoration:line-through; color:#a49b8d; }
	.director-eliminated-actions { display:flex; align-items:center; gap:8px; }
	.restore-button { background:#1d2b22; border-color:#405c43; color:#b8d6a7; white-space:nowrap; }
	.director-empty { padding:26px 12px; text-align:center; color:#8f8779; }
	.order-button { width:30px; height:30px; border-radius:6px; background:#211e18; border-color:#5a482b; color:#c4a36a; touch-action:manipulation; }
	@media (max-width:700px) {
		.app { height:100dvh; min-height:100dvh; padding:10px 10px max(8px, env(safe-area-inset-bottom)); }
		.header { align-items:flex-start; gap:8px; margin-bottom:8px; }
		.header h2 { font-size:16px; }
		.header-actions { justify-content:flex-end; gap:5px; }
		.header-actions .sound { display:none; }
		.clock-button { padding:7px 9px; font-size:11px; }
		.tabs { gap:2px; overflow-x:auto; white-space:nowrap; margin-top:6px; }
		.tabs button { flex:1 0 auto; padding:9px 10px; font-size:12px; }
		main { overflow:hidden; }
		.director-dashboard { padding-bottom:12px; }
		.director-level-bar { grid-template-columns:42px minmax(0,1fr) 42px; gap:6px; }
		.level-arrow { min-height:136px; font-size:17px; }
		.level-main { min-height:136px; padding:9px 5px; }
		.director-clock { font-size:clamp(38px,12vw,54px); }
		.director-level-context { font-size:9px; margin-bottom:12px; }
		.director-players { padding:11px; }
		.director-player-row { min-height:60px; padding:8px; gap:7px; }
		.director-player-identity strong { font-size:13px; }
		.eliminate-button, .restore-button { min-height:42px; padding:0 9px; font-size:9px; }
		.director-eliminated-actions { gap:5px; }
		.director-eliminated-actions .order-button { width:27px; height:30px; }
		.setup-layout, .setup-sidebar { display:flex; flex-direction:column; }
		.setup-layout .table { max-height:none; }
	}


	/* Match the original Chromecast receiver colourway throughout the TDC */
	.app, .mode-play, .mode-break, .mode-paused {
		background: radial-gradient(circle at top, rgba(255,255,255,.07), transparent 36rem), #101214 !important;
		color: #f4f4f1 !important;
	}
	.levels-card, .setup-card, .payout-card, .location-card, .table-card, .director-players,
	.redtooth-panel, .clock-modal {
		background: #181b1f !important;
		border-color: #343a40 !important;
		color: #f4f4f1 !important;
	}
	.header h2, .director-eyebrow, .director-blinds, .director-player-count,
	.director-eliminated-heading {
		color: #c4a36a !important;
	}
	.header { border-bottom-color: rgba(196,163,106,.2) !important; }
	.tabs { border-color: rgba(196,163,106,.25) !important; }
	.tabs button, .sound, .add, .secondary, .mixed-toggle,
	.level-arrow, .order-button, .redtooth-control {
		background: #181b1f !important;
		color: #d8c49c !important;
		border-color: #343a40 !important;
	}
	.clock-button, .tabs button.active, .primary, .director-add-button {
		background: #c4a36a !important;
		color: #101214 !important;
		border-color: #c4a36a !important;
	}
	.level-main {
		background: linear-gradient(145deg, #24282d, #181b1f) !important;
		border-color: #5b4b32 !important;
	}
	.director-player-row {
		background: #181b1f !important;
		border-color: #343a40 !important;
	}
	.director-player-identity strong, .director-section-heading h1 { color: #f4f4f1 !important; }
	.director-player-identity span, .director-hint, .director-level-context,
	.director-empty { color: #8e969d !important; }
	.director-progress { background: #292e34 !important; }
	input, select, textarea, .setup-fields input, .add-player-form input, .player-row input {
		background: #101214 !important;
		color: #f4f4f1 !important;
		border-color: #343a40 !important;
	}
	.redtooth-row:hover { background: #24282d !important; }
	.redtooth-position, .redtooth-player-name span, .redtooth-games,
	.redtooth-column-head, .redtooth-header { color: #d8dde1 !important; }
	.redtooth-points { color: #c4a36a !important; }
	.redtooth-boundary.regional-boundary, .redtooth-boundary.playoff-boundary {
		background: #24282d !important;
		color: #c4a36a !important;
	}

</style>
