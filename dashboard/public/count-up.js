/**
 * count-up.js — v1.8.0 part 2, item 4 (micro-interactions: count-up stat
 * numbers on overview.html).
 *
 * Pure helpers for the count-up animation, split out from the
 * requestAnimationFrame driver so the actual math (easing + value
 * interpolation + stagger-delay calculation) is unit-testable without a
 * browser/DOM. Same convention as deep-link.js — plain <script> on the page,
 * also `require()`-able from Node for vitest.
 */

'use strict';

/**
 * Ease-out-cubic — starts fast, settles gently into the final value. Chosen
 * over linear so the animation doesn't feel mechanical, and over
 * ease-in-out because a stat card counting *up* to a number reads better
 * starting fast (grabs attention) than starting slow.
 *
 * @param {number} t  progress in [0, 1]
 * @returns {number} eased progress in [0, 1]
 */
function easeOutCubic(t) {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

/**
 * Interpolates between `from` and `to` at elapsed/duration progress,
 * rounding to the nearest integer (stat-card values are always whole
 * numbers — counts, percentages, seconds).
 *
 * @param {number} from
 * @param {number} to
 * @param {number} elapsedMs
 * @param {number} durationMs
 * @returns {number}
 */
function countUpValue(from, to, elapsedMs, durationMs) {
  if (!durationMs || durationMs <= 0 || elapsedMs >= durationMs) return to;
  if (elapsedMs <= 0) return from;
  const progress = easeOutCubic(elapsedMs / durationMs);
  return Math.round(from + (to - from) * progress);
}

/**
 * Stagger delay (ms) for the Nth row in a fade-in list, capped so a very
 * long list doesn't produce a slow, distracting cascade (v1.8.0 part 2,
 * item 4: "20-40ms stagger... not a slow distracting cascade").
 *
 * @param {number} index      0-based row index
 * @param {number} [stepMs]   per-row delay, default 30ms
 * @param {number} [maxMs]    hard cap, default 300ms (~10 rows in)
 * @returns {number}
 */
function staggerDelayMs(index, stepMs = 30, maxMs = 300) {
  if (index < 0) return 0;
  return Math.min(index * stepMs, maxMs);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { easeOutCubic, countUpValue, staggerDelayMs };
}
