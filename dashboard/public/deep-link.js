/**
 * deep-link.js — v1.5.0 item 2 (Deep-link URL state).
 *
 * Pure helpers for syncing a page's filter/tab/selection state with the URL
 * query string, so a QA can paste a link to "this exact view" to a
 * colleague. No router library — just URLSearchParams + history.replaceState
 * (the caller does the replaceState call; these two functions only handle
 * the plain-object <-> query-string translation, which is what's actually
 * worth unit-testing).
 *
 * Loaded as a plain <script> on every page that needs it (no build step,
 * same convention as shared.js), but also usable directly from Node via
 * `require('./deep-link.js')` for vitest — see __tests__/deep-link.test.js.
 *
 * `spec` is a small declarative map: { paramName: { key: stateKey, default: v } }
 * — e.g. { suite: { key: 'suite', default: '' }, status: { key: 'status', default: '' } }.
 * Only non-default values are written to the URL, keeping links short.
 */

'use strict';

/**
 * Reads a state object out of a URLSearchParams-like source (anything with
 * a `.get(name)` method — a real URLSearchParams, or a plain object works
 * too if wrapped by the caller).
 *
 * @param {URLSearchParams} params
 * @param {object} spec  { paramName: { key, default } }
 * @returns {object}  { [key]: value }
 */
function parseDeepLinkParams(params, spec) {
  const state = {};
  for (const [paramName, def] of Object.entries(spec)) {
    const raw = params.get(paramName);
    state[def.key] = (raw === null || raw === '') ? def.default : raw;
  }
  return state;
}

/**
 * Builds a URLSearchParams from a state object, per `spec`, omitting any
 * key whose value equals its declared default (so filters reset to "all"
 * don't pollute the URL forever).
 *
 * @param {object} state  { [key]: value }
 * @param {object} spec   { paramName: { key, default } }
 * @returns {URLSearchParams}
 */
function buildDeepLinkParams(state, spec) {
  const params = new URLSearchParams();
  for (const [paramName, def] of Object.entries(spec)) {
    const value = state[def.key];
    if (value !== undefined && value !== null && value !== '' && value !== def.default) {
      params.set(paramName, value);
    }
  }
  return params;
}

/**
 * Writes `state` into the current URL via history.replaceState (not
 * pushState — filter changes shouldn't spam browser back-history). No-op
 * outside a browser (e.g. under vitest).
 *
 * @param {object} state
 * @param {object} spec
 */
function syncDeepLinkState(state, spec) {
  if (typeof window === 'undefined' || typeof history === 'undefined') return;
  const params = buildDeepLinkParams(state, spec);
  const qs = params.toString();
  const url = location.pathname + (qs ? `?${qs}` : '');
  history.replaceState(null, '', url);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseDeepLinkParams, buildDeepLinkParams, syncDeepLinkState };
}
