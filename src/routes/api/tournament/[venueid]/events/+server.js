import { subscribeTournament } from '$lib/server/tournament-events';

/** @param {{ params: { venueid: string } }} event */
export function GET({ params }) {
  if (!/^\d{1,12}$/.test(String(params.venueid ?? ''))) {
    return new Response('Invalid venue ID.', { status: 400 });
  }

  let unsubscribe = () => {};
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let heartbeat;
  const stream = new ReadableStream({
    start(controller) {
      /** @param {{ type: string; at: number }} payload */
      const send = (payload) => {
        try { controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(payload) + '\n\n')); }
        catch { /* The client has disconnected. */ }
      };
      send({ type: 'connected', at: Date.now() });
      unsubscribe = subscribeTournament(params.venueid, send);
      heartbeat = setInterval(() => send({ type: 'heartbeat', at: Date.now() }), 20000);
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
