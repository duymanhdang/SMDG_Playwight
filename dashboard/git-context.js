/**
 * git-context.js — read-only git metadata for a run (§6.2, v1.0.0).
 *
 * Shells out to `git` via spawnSync with shell:false (never shell:true —
 * this codebase already fixed that pattern in v0.7, stay consistent). Must
 * NEVER throw: when PROJECT_ROOT is not a git repo, or git isn't on PATH,
 * every field comes back null. This literal repo (as of writing) is not a
 * git repo, so that path is exercised for real, not just hypothetically.
 */

'use strict';

const { spawnSync } = require('child_process');

function runGit(args, cwd) {
  try {
    const result = spawnSync('git', args, { cwd, shell: false, encoding: 'utf8', timeout: 5000 });
    if (result.error) return null;
    if (result.status !== 0) return null;
    return typeof result.stdout === 'string' ? result.stdout : null;
  } catch (_) {
    return null;
  }
}

/** Pure parsing of `git status --porcelain` output — split out for unit tests. */
function isDirtyFromPorcelain(output) {
  if (output === null || output === undefined) return null;
  return output.trim().length > 0;
}

/**
 * @param {string} projectRoot
 * @returns {{branch: string|null, commitSha: string|null, dirty: boolean|null}}
 */
function getGitContext(projectRoot) {
  const branchOut = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], projectRoot);
  const shaOut    = runGit(['rev-parse', 'HEAD'], projectRoot);
  const statusOut = runGit(['status', '--porcelain'], projectRoot);

  return {
    branch:    branchOut !== null ? branchOut.trim() : null,
    commitSha: shaOut !== null ? shaOut.trim() : null,
    dirty:     isDirtyFromPorcelain(statusOut),
  };
}

module.exports = { getGitContext, isDirtyFromPorcelain };
