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

/**
 * @typedef {{
 *   redtoothId: number | null;
 * }} RedtoothPlayer
 */

/** @type {Record<number, number>} */
export const REDTOOTH_POINTS = {
	1: 100,
	2: 80,
	3: 70,
	4: 60,
	5: 50,
	6: 40,
	7: 30,
	8: 20
};

/**
 * @param {number} place
 * @returns {number}
 */
export function pointsForPlace(place) {
	return REDTOOTH_POINTS[place] ?? 10;
}

/**
 * @param {unknown} name
 * @returns {string}
 */
export function normaliseRedtoothName(name) {
	return String(name ?? '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

/**
 * @param {RedtoothRow[]} rows
 * @param {string} query
 * @returns {RedtoothRow[]}
 */
export function searchRedtoothPlayers(rows, query) {
	const q = normaliseRedtoothName(query);

	if (!q) return [];

	return rows
		.filter((row) => normaliseRedtoothName(row.name).includes(q))
		.sort((a, b) => {
			const ae = normaliseRedtoothName(a.name) === q ? 0 : 1;
			const be = normaliseRedtoothName(b.name) === q ? 0 : 1;

			return ae - be || a.position - b.position;
		})
		.slice(0, 10);
}

/**
 * @param {RedtoothRow[]} rows
 * @param {RedtoothPlayer} player
 * @param {number} finishPlace
 * @returns {RedtoothRow[]}
 */
export function applyLocalResult(rows, player, finishPlace) {
	const nextPoints = pointsForPlace(finishPlace);

	return rows.map((row) => {
		if (!player.redtoothId || row.redtoothId !== player.redtoothId) {
			return row;
		}

		return {
			...row,
			localGames: (row.localGames ?? 0) + 1,
			localPoints: (row.localPoints ?? 0) + nextPoints,
			pendingPoints: (row.pendingPoints ?? 0) + nextPoints,
			qualification: null
		};
	});
}

/**
 * @param {RedtoothRow[]} rows
 * @returns {RedtoothRow[]}
 */
export function projectedRows(rows) {
	const projected = rows.map((row) => ({
		...row,
		games: row.games + (row.localGames ?? 0),
		points: row.points + (row.localPoints ?? 0),
		confirmedPoints: row.points,
		confirmedGames: row.games,
		pendingPoints: row.pendingPoints ?? 0
	}));

	projected.sort((a, b) => b.points - a.points || a.games - b.games || a.position - b.position);

	/** @type {number | null} */
	let previousPoints = null;

	let previousPosition = 0;

	return projected.map((row, index) => {
		const position = row.points === previousPoints ? previousPosition : index + 1;

		previousPoints = row.points;
		previousPosition = position;

		return {
			...row,
			projectedPosition: position
		};
	});
}
