/**
 * verify-traceability-tags.js — post-tagging verification using the SAME
 * scanner the dashboard uses (dashboard/tag-scanner.js).
 *
 * Reports: per-file @bp:/@TC- gaps, distinct business processes, test vs
 * @TC- counts, and any @bp- / @tc- typos. Exit code 1 if gaps found.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUITES_DIR = path.join(ROOT, 'suites');
const { scanFileForExtendedTags, scanFileForTestTags } = require(path.join(ROOT, 'dashboard', 'tag-scanner.js'));

function listSpecFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.spec.ts')) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

function main() {
  const files = listSpecFiles(SUITES_DIR);
  const noBP = [];
  const noTC = [];
  const typos = [];
  const bps = new Set();
  const tcs = new Set();
  let testCount = 0;
  let tcCount = 0;

  for (const file of files) {
    const ext = scanFileForExtendedTags(file);
    const perTest = scanFileForTestTags(file);

    if (!ext.businessProcesses.length) noBP.push(path.relative(ROOT, file));
    if (!ext.testCaseIds.length) noTC.push(path.relative(ROOT, file));
    for (const bp of ext.businessProcesses) bps.add(bp);
    for (const tc of ext.testCaseIds) tcs.add(tc);
    for (const typo of ext.tagTypos) typos.push({ file: path.relative(ROOT, file), ...typo });

    testCount += perTest.length;
    tcCount += ext.testCaseIds.length;
  }

  console.log(`spec files scanned : ${files.length}`);
  console.log(`tests found        : ${testCount}`);
  console.log(`@TC- tags found    : ${tcCount}`);
  console.log(`distinct @bp:      : ${bps.size} -> ${Array.from(bps).sort().join(', ')}`);
  console.log(`files w/o @bp:     : ${noBP.length}`);
  console.log(`files w/o @TC-     : ${noTC.length}`);
  console.log(`@bp-/@tc- typos    : ${typos.length}`);

  noBP.slice(0, 10).forEach((f) => console.log(`  [no @bp:] ${f}`));
  noTC.slice(0, 10).forEach((f) => console.log(`  [no @TC-] ${f}`));
  typos.forEach((t) => console.log(`  [typo] ${t.file}: ${t.found}`));

  const ok = noBP.length === 0 && noTC.length === 0 && typos.length === 0;
  console.log(ok ? '\nPASS' : '\nFAIL');
  process.exit(ok ? 0 : 1);
}

main();
