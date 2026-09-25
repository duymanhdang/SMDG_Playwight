import path from 'path';
import { describe, it, expect } from 'vitest';
import { getGitContext, isDirtyFromPorcelain } from '../git-context.js';

describe('git-context — isDirtyFromPorcelain (pure parsing)', () => {
  it('returns null when the underlying git command never ran (not a repo / git missing)', () => {
    expect(isDirtyFromPorcelain(null)).toBeNull();
    expect(isDirtyFromPorcelain(undefined)).toBeNull();
  });

  it('returns false for empty porcelain output (clean working tree)', () => {
    expect(isDirtyFromPorcelain('')).toBe(false);
    expect(isDirtyFromPorcelain('   \n  ')).toBe(false);
  });

  it('returns true when porcelain output lists changed files', () => {
    expect(isDirtyFromPorcelain(' M dashboard/server.js\n?? new-file.txt\n')).toBe(true);
  });
});

describe('git-context — getGitContext never throws', () => {
  it('returns {branch:null, commitSha:null, dirty:null} for a directory that is not a git repo', () => {
    // The actual repo under test (this project) is confirmed NOT a git repo
    // as of this pass — exercising the real non-repo path, not a mock.
    const projectRoot = path.resolve(__dirname, '..', '..');
    const ctx = getGitContext(projectRoot);
    expect(ctx).toEqual({ branch: null, commitSha: null, dirty: null });
  });

  it('never throws even when given a nonexistent path', () => {
    expect(() => getGitContext('/definitely/not/a/real/path/xyz')).not.toThrow();
    const ctx = getGitContext('/definitely/not/a/real/path/xyz');
    expect(ctx.branch).toBeNull();
    expect(ctx.commitSha).toBeNull();
  });
});
