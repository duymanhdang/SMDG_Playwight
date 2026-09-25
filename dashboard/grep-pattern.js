/**
 * grep-pattern.js — builds a Playwright --grep alternation pattern from a
 * list of test titles.
 *
 * §3.3 fix: each title is anchored with (?:^|\s)...$ so it can never match
 * as a substring of another test's title. Playwright's --grep is a regex
 * *search* over the full test title, not an exact match — without the
 * anchors, quarantining/re-running "create material master" would also
 * silently swallow "create material master with attachment", etc.
 */

function buildGrepPattern(titles) {
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return titles.map((t) => `(?:^|\\s)${esc(t)}$`).join('|');
}

module.exports = { buildGrepPattern };
