import { WebSocketServer } from 'ws';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('.data');
const DATA_FILE = path.join(DATA_DIR, 'tournament.json');

/** @type {any} */
let state = null;

/** @type {any} */
let wss = null;

function defaultState() {
	return {
		players: [],
		nextPlayerId: 1,
		currentLevel: 0,
		timeRemaining: 0,
		isRunning: false,
		activeTab: 'timer',
		balanceSuggestions: [],
		balanceMessage: null,
		lastUpdated: Date.now()
	};
}

function loadState() {
	if (state) return state;

	try {
		if (fs.existsSync(DATA_FILE)) {
			state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
			return state;
		}
	} catch (error) {
		console.error('Failed to load tournament state:', error);
	}

	state = defaultState();
	return state;
}

function saveState() {
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true });
		fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
	} catch (error) {
		console.error('Failed to save tournament state:', error);
	}
}

function broadcast() {
	if (!wss) return;

	const message = JSON.stringify({
		type: 'state',
		state
	});

	for (const client of wss.clients) {
		if (client.readyState === 1) {
			client.send(message);
		}
	}
}

/** @param {any} newState */
function updateState(newState) {
	state = {
		...state,
		...newState,
		lastUpdated: Date.now()
	};

	saveState();
	broadcast();
}

/** @param {any} server */
export function setupTournamentWebSocket(server) {
	if (wss) return;

	loadState();

	wss = new WebSocketServer({
		server,
		path: '/ws'
	});

	wss.on('connection', (/** @type {import('ws').WebSocket} */ socket) => {
		console.log('Tournament client connected');

		// Immediately send the current tournament state.
		socket.send(
			JSON.stringify({
				type: 'state',
				state
			})
		);

		socket.on('message', (/** @type {any} */ raw) => {
			try {
				const message = JSON.parse(raw.toString());

				if (message.type === 'update') {
					updateState(message.state);
				}

				if (message.type === 'request-state') {
					socket.send(
						JSON.stringify({
							type: 'state',
							state
						})
					);
				}
			} catch (error) {
				console.error('Invalid WebSocket message:', error);
			}
		});

		socket.on('close', () => {
			console.log('Tournament client disconnected');
		});
	});
}
