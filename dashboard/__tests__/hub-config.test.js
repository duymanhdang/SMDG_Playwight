import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readHubConfig } from '../hub-config.js';

const DEFAULTS = { maxSpecs: 4, maxSuites: 2, maxTotalWorkers: 6 };

function tmpConfigPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hub-config-test-')), 'hub.config.json');
}

describe('readHubConfig (§A6 — optional dashboard/hub.config.json overrides)', () => {
  let filesToClean = [];

  afterEach(() => {
    for (const f of filesToClean) {
      try { fs.rmSync(path.dirname(f), { recursive: true, force: true }); } catch (_) {}
    }
    filesToClean = [];
  });

  it('returns the defaults untouched when the file does not exist', () => {
    const filePath = tmpConfigPath();
    filesToClean.push(filePath);
    const result = readHubConfig(DEFAULTS, filePath);
    expect(result).toEqual(DEFAULTS);
  });

  it('falls back to defaults and never throws on malformed JSON', () => {
    const filePath = tmpConfigPath();
    filesToClean.push(filePath);
    fs.writeFileSync(filePath, '{ not valid json ,,, ');
    expect(() => readHubConfig(DEFAULTS, filePath)).not.toThrow();
    expect(readHubConfig(DEFAULTS, filePath)).toEqual(DEFAULTS);
  });

  it('merges a valid override file over the defaults', () => {
    const filePath = tmpConfigPath();
    filesToClean.push(filePath);
    fs.writeFileSync(filePath, JSON.stringify({ maxSuites: 5 }));
    const result = readHubConfig(DEFAULTS, filePath);
    expect(result).toEqual({ maxSpecs: 4, maxSuites: 5, maxTotalWorkers: 6 });
  });

  it('ignores unknown keys and keeps defaults for them', () => {
    const filePath = tmpConfigPath();
    filesToClean.push(filePath);
    fs.writeFileSync(filePath, JSON.stringify({ maxSuites: 3, someRandomKey: 'nope' }));
    const result = readHubConfig(DEFAULTS, filePath);
    expect(result).toEqual({ maxSpecs: 4, maxSuites: 3, maxTotalWorkers: 6 });
    expect(result.someRandomKey).toBeUndefined();
  });

  it('ignores a type-mismatched override value and keeps the default', () => {
    const filePath = tmpConfigPath();
    filesToClean.push(filePath);
    fs.writeFileSync(filePath, JSON.stringify({ maxSuites: 'not-a-number' }));
    const result = readHubConfig(DEFAULTS, filePath);
    expect(result.maxSuites).toBe(DEFAULTS.maxSuites);
  });

  it('falls back to defaults when the file is a JSON array, not an object', () => {
    const filePath = tmpConfigPath();
    filesToClean.push(filePath);
    fs.writeFileSync(filePath, JSON.stringify([1, 2, 3]));
    const result = readHubConfig(DEFAULTS, filePath);
    expect(result).toEqual(DEFAULTS);
  });
});
