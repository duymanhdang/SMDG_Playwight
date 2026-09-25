/**
 * Data Factory - Test Data Generation Utilities
 * Generates unique, timestamp-based test data for parallel test execution
 */

import * as crypto from 'node:crypto';

export function generateTimestamp(): string {
  return Date.now().toString();
}

export function generateBPNum(): string {
  return generateTimestamp().slice(-8);
}

export function generateBPName(): string {
  return `AUTO-BP-${generateBPNum()}`;
}

export function generateSearchTerm(): string {
  return `AUTO-${generateTimestamp().slice(-6)}`;
}

export function generateEmail(): string {
  const num = generateTimestamp().slice(-8);
  return `automation+${num}@laidon.com`;
}

export function generatePhone(): string {
  const num = Math.floor(Math.random() * 9000000000 + 1000000000);
  return `1${num}`;
}

export function generateNotes(prefix: string): string {
  return `${prefix} - ${generateTimestamp()}`;
}

/**
 * Generate MM01 timestamp matching Excel formula:
 *   =TEXT(FLOOR(NOW(); "00:01"); "yyyymmdd_hhmm")
 * Returns: yyyymmdd_hhmm (e.g., "20260520_1430")
 */
export function generateMMTimestamp(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMilliseconds(0);
  const y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${y}${M}${d}_${h}${m}`;
}

/**
 * generateMMTimestamp() plus a short random hex token, so values built from a
 * single timestamp are unique per call — even for multiple testcases running
 * concurrently within the same minute (prevents false backend DUPLICATE hits).
 * Returns: yyyymmdd_hhmm_xxxxxx (e.g. "20260811_1430_a1b2c3")
 */
export function generateUniqueMMTimestamp(): string {
  return `${generateMMTimestamp()}_${crypto.randomBytes(3).toString('hex')}`;
}
