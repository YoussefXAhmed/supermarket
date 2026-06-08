/**
 * Notification chime — generated at runtime via Web Audio API so there's no
 * binary asset to ship, license, or load. One short professional "ding"
 * (two-note pleasant arpeggio with a fast attack and gentle decay).
 *
 * Browsers gate AudioContext creation/playback behind a user gesture; in
 * practice users click around the SPA before the first notification fires,
 * so the context will already be unlocked by then. If it isn't, playback
 * silently no-ops — never throws.
 */

let _ctx = null;
let _enabled = true;
let _lastPlayedAt = 0;

/** Cooldown in ms — caps audible notifications at one every 3 seconds even
 *  if multiple arrive together (Slack / Teams style behaviour). */
const MIN_GAP_MS = 3000;

function getCtx() {
  if (_ctx) return _ctx;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    _ctx = new Ctor();
    return _ctx;
  } catch {
    return null;
  }
}

/** Toggle sound on/off globally (e.g. user mute preference). */
export function setNotificationSoundEnabled(on) {
  _enabled = !!on;
}

export function isNotificationSoundEnabled() {
  return _enabled;
}

/**
 * Play one notification chime. Safe to call from anywhere; coalesces rapid
 * repeat calls. Returns true if a sound was scheduled, false if skipped.
 */
export function playNotificationSound() {
  if (!_enabled) return false;
  const now = Date.now();
  if (now - _lastPlayedAt < MIN_GAP_MS) return false;
  const ctx = getCtx();
  if (!ctx) return false;
  try {
    // Resume if suspended (Chrome autoplay policy).
    if (ctx.state === 'suspended') ctx.resume();

    const start = ctx.currentTime;
    // Two-note "ding-dong": E5 then C5, each ~150ms, soft attack + decay.
    const notes = [
      { freq: 659.25, at: 0.00, dur: 0.18 }, // E5
      { freq: 523.25, at: 0.13, dur: 0.22 }, // C5
    ];
    const master = ctx.createGain();
    master.gain.value = 0.18; // keep it quiet — supermarket setting
    master.connect(ctx.destination);

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.freq;
      // Envelope: fast attack (10ms) → exponential decay to silence by `dur`.
      const t0 = start + n.at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(1.0, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + n.dur + 0.02);
    }
    _lastPlayedAt = now;
    return true;
  } catch {
    return false;
  }
}
