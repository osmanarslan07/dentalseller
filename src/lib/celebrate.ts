"use client";

import confetti from "canvas-confetti";

/** Small celebratory burst — used for sale/payment/tier-jump moments. Respects
 * prefers-reduced-motion via canvas-confetti's own built-in check. */
export function fireConfetti() {
  confetti({
    particleCount: 90,
    spread: 75,
    origin: { y: 0.7 },
    colors: ["#0d9488", "#14b8a6", "#5eead4", "#f59e0b", "#fbbf24"],
    disableForReducedMotion: true,
  });
}

/** Two-note synthesized chime (no audio file to fetch/host) — a bright "cha-ching" for
 * payment/sale moments. Best-effort: a browser without Web Audio, or one that blocks
 * autoplay-adjacent audio, should never break the save flow this is attached to. */
export function playChime() {
  try {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const now = ctx.currentTime;

    for (const [freq, start] of [
      [880, now],
      [1318.5, now + 0.09],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    }

    setTimeout(() => ctx.close(), 500);
  } catch {
    // best-effort, see above
  }
}
