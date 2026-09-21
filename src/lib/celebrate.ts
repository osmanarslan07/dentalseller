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
