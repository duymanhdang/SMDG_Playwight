/**
 * hub-config.js — optional dashboard/hub.config.json overrides (v0.9.0, §A6).
 *
 * §5.10 of CODE_REVIEW_v0.6.0-alpha.md flagged the concurrency LIMITS as
 * hardcoded in server.js. This module reads an OPTIONAL plain-JSON config
 * file (no YAML dependency added — that's the v1.0 hub.config.yaml plan,
 * out of scope here) and merges it over the given defaults. Missing or
 * malformed config is never fatal: boot always succeeds with the defaults,
 * a warning is logged to the console instead.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, 'hub.config.json');

/**
 * @param {object} defaults      Fallback values (e.g. the existing LIMITS object).
 * @param {string} [configPath]  Override path — used by tests to point at a temp file.
 * @returns {object} defaults merged with any valid keys found in the config file.
 */
function readHubConfig(defaults, configPath) {
  const filePath = configPath || DEFAULT_CONFIG_PATH;

  if (!fs.existsSync(filePath)) {
    return { ...defaults };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.warn(`[hub-config] Could not read ${filePath}, using defaults:`, err.message);
    return { ...defaults };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[hub-config] Malformed JSON in ${filePath}, using defaults:`, err.message);
    return { ...defaults };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(`[hub-config] ${filePath} did not contain a JSON object, using defaults.`);
    return { ...defaults };
  }

  // Only merge keys that already exist in defaults, and only when the type
  // matches — an unrelated/malformed key must never silently introduce a
  // bad value (e.g. a string where a number is expected).
  const merged = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(parsed, key)) {
      const value = parsed[key];
      if (typeof value === typeof defaults[key] && !(typeof value === 'number' && Number.isNaN(value))) {
        merged[key] = value;
      } else {
        console.warn(`[hub-config] Ignoring invalid value for "${key}" in ${filePath} (expected ${typeof defaults[key]}).`);
      }
    }
  }
  return merged;
}

module.exports = { readHubConfig, DEFAULT_CONFIG_PATH };
