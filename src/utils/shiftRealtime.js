/**
 * Cross-tab shift state broadcast.
 *
 * When any tab/window submits or approves a shift action (open / close /
 * approve / reject), it dispatches a 'shift:changed' message on a
 * BroadcastChannel. POSPage + useShiftPresence subscribe and trigger an
 * immediate revalidation — bypassing the 8-second poll for instant sync
 * within the same browser.
 *
 * Cross-machine sync still relies on the poll (8s); for true server-pushed
 * realtime, wire Frappe socketio later.
 */

const CHANNEL_NAME = 'elmahdi:shift';
let channel = null;

function getChannel() {
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    channel = null;
  }
  return channel;
}

/** Publish a shift-state change to all tabs (same origin). */
export function publishShiftChanged(reason = 'unknown', detail = {}) {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage({ reason, detail, at: Date.now() });
  } catch {
    /* ignore */
  }
}

/** Subscribe to shift-state changes. Returns an unsubscribe fn. */
export function onShiftChanged(handler) {
  const ch = getChannel();
  if (!ch) return () => {};
  const wrapped = (e) => {
    try { handler(e.data); } catch { /* ignore */ }
  };
  ch.addEventListener('message', wrapped);
  return () => ch.removeEventListener('message', wrapped);
}
