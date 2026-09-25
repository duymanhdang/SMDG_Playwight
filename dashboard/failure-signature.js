/**
 * failure-signature.js — normalizes a Playwright error message into a stable
 * "signature" so recurring failures with the same root cause (but different
 * material numbers, timestamps, ids, line numbers, etc.) can be grouped
 * together (§v1.3.0 item 3 — failure signature clustering).
 *
 * Pure, regex-based, deliberately not an NLP solution — good enough to
 * collapse "Timeout waiting for #mat-4521" and "Timeout waiting for #mat-9981"
 * into the same bucket.
 */

'use strict';

/**
 * @param {string} errorMessage
 * @returns {string} normalized signature (empty string for falsy input)
 */
function normalizeErrorSignature(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') return '';

  let sig = errorMessage;

  // Collapse Windows/POSIX absolute file paths (with optional :line:col) down
  // to a placeholder — these vary by machine/checkout and are never the
  // actual root cause of a grouping decision.
  sig = sig.replace(/[A-Za-z]:\\[^\s:'"]+(:\d+:\d+)?/g, '<path>');
  sig = sig.replace(/\/(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z]+(:\d+:\d+)?/g, '<path>');

  // ISO-ish timestamps, e.g. 2026-08-04T10:15:30.123Z or 2026-08-04 10:15:30
  sig = sig.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g, '<timestamp>');

  // UUID-like hex strings (with or without dashes)
  sig = sig.replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '<uuid>');
  sig = sig.replace(/\b[0-9a-fA-F]{16,}\b/g, '<hex>');

  // Any remaining runs of digits (material numbers, ports, ms durations,
  // line/column numbers, element counts, etc.) collapse to a single marker.
  sig = sig.replace(/\d+/g, '#');

  // Collapse whitespace (multi-line stacks -> single line) for a stable key.
  sig = sig.replace(/\s+/g, ' ').trim();

  return sig;
}

module.exports = { normalizeErrorSignature };
