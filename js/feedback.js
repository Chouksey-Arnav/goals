// Immediate sensory reward: a short synthesized chime and a haptic tap the
// instant a lesson is ticked. No audio files, nothing to download.
// Pitch climbs with each lesson finished today, so progress is audible.

let ctx = null;
let enabled = true;
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // major pentatonic, semitones

export function setEnabled(on) {
  enabled = !!on;
}

function audio() {
  if (!enabled) return null;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function note(a, semis, at, dur = 0.28, gain = 0.08, type = "sine") {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = 523.25 * Math.pow(2, semis / 12); // from C5
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

// One lesson done. `step` = lessons finished today so far.
export function chime(step = 0) {
  navigator.vibrate?.(12);
  const a = audio();
  if (!a) return;
  const s = SCALE[Math.min(step, SCALE.length - 1)];
  const t = a.currentTime;
  note(a, s, t, 0.22, 0.07, "triangle");
  note(a, s + 12, t + 0.06, 0.3, 0.04);
}

// The whole day done: a rising arpeggio.
export function fanfare() {
  navigator.vibrate?.([20, 60, 20, 60, 40]);
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => note(a, s, t + i * 0.07, 0.5, 0.06, "triangle"));
}

// A softer two-note "unlock" for milestones and deposits.
export function sparkle() {
  navigator.vibrate?.([10, 40, 10]);
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  note(a, 19, t, 0.25, 0.05);
  note(a, 24, t + 0.09, 0.4, 0.05);
}

// A low, short thud for a slip or a strike. Felt, not shamed.
export function thud() {
  navigator.vibrate?.(40);
  const a = audio();
  if (!a) return;
  note(a, -17, a.currentTime, 0.35, 0.09, "sine");
}
