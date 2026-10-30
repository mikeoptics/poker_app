// Lightweight in-process notifications for connected tournament clients.
// SQLite remains the durable source of truth; this module only signals live clients.
const listeners = new Map();

/** @param {string | number} venueId @param {(event: { type: string; at: number }) => void} listener */
export function subscribeTournament(venueId, listener) {
  const key = String(venueId);
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(listener);
  return () => {
    const venueListeners = listeners.get(key);
    venueListeners?.delete(listener);
    if (venueListeners?.size === 0) listeners.delete(key);
  };
}

/** @param {string | number} venueId */
export function publishTournamentUpdate(venueId) {
  const event = { type: 'update', at: Date.now() };
  for (const listener of listeners.get(String(venueId)) ?? []) {
    try { listener(event); } catch (error) { console.warn('Tournament subscriber failed:', error); }
  }
}
