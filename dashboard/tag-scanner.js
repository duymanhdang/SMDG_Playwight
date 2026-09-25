/**
 * tag-scanner.js — Scans spec files for @tag annotations used to filter test
 * cases in the UI (e.g. @smoke, @P1, @regression) and for traceability tags
 * (@TC-n, @bp:x) used by the Coverage/Readiness reports.
 *
 * Convention: put the tag directly in the test/describe title, Playwright-style:
 *   test('should create material master @smoke @P1', async () => { ... });
 *   test('create material @bp:material-create', {tag: ['@smoke']}, async () => {});
 *
 * v1.6.0 — AST rewrite (§3.2 fix). Tags are now resolved PER TEST, not per
 * file: this module parses each spec file with the TypeScript compiler API
 * and walks the AST looking specifically at the title-string arguments of
 * test()/test.describe()/test.only()/test.skip()/test.fixme() calls (plus
 * the modern `{ tag: [...] }` second-argument array, if present). A tag on
 * an enclosing test.describe() title is inherited by every test nested
 * inside it, combined with any tags on the test's own title.
 *
 * Because extraction only ever looks at title-argument string literals (never
 * arbitrary string literals, comments/JSDoc, or import specifiers), the
 * previously-documented false-positive regression — JSDoc `@param`/`@returns`,
 * email addresses, `@ts-ignore` directives, and the `@playwright/test` import
 * specifier all leaking in as fake tags under the old whole-file regex scan —
 * is fixed as a natural consequence of this design, not patched around.
 */

const fs = require('fs');
const ts = require('typescript');

const TAG_RE = /@([A-Za-z][A-Za-z0-9_-]*)\b(?!\/)/g;

// §6.3 (v1.0.0) traceability tags.
const TEST_CASE_ID_RE   = /@TC-(\d+)/g;
const BUSINESS_PROC_RE  = /@bp:([\w-]+)/g;

// §v1.4.0 item 3 — tag taxonomy validation typo heuristics.
const BP_TYPO_RE = /@bp-([\w-]+)/g;
const TC_TYPO_RE = /@tc-(\d+)/g;

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }
}

/** Pure text -> {testCaseIds, businessProcesses} extraction, split out for
 * unit testing without touching the filesystem. Operates on any string
 * (a full file's content, or just a single title) — the regexes only match
 * the specific @TC-\d+ / @bp:[\w-]+ conventions so there's no ambiguity. */
function extractTraceabilityTags(content) {
  const testCaseIds = new Set();
  const businessProcesses = new Set();
  if (typeof content !== 'string') return { testCaseIds: [], businessProcesses: [] };

  let match;
  const tcRe = new RegExp(TEST_CASE_ID_RE.source, TEST_CASE_ID_RE.flags);
  while ((match = tcRe.exec(content)) !== null) testCaseIds.add(`TC-${match[1]}`);

  const bpRe = new RegExp(BUSINESS_PROC_RE.source, BUSINESS_PROC_RE.flags);
  while ((match = bpRe.exec(content)) !== null) businessProcesses.add(match[1]);

  return {
    testCaseIds: Array.from(testCaseIds).sort(),
    businessProcesses: Array.from(businessProcesses).sort(),
  };
}

/** Pure text -> likely-typo list extraction (v1.4.0 item 3). Same
 * any-string-in, split-out-for-testing pattern as extractTraceabilityTags(). */
function findTagTypos(content) {
  const typos = [];
  if (typeof content !== 'string') return typos;

  let match;
  const bpRe = new RegExp(BP_TYPO_RE.source, BP_TYPO_RE.flags);
  while ((match = bpRe.exec(content)) !== null) {
    typos.push({ found: match[0], likelyIntended: `@bp:${match[1]}` });
  }

  const tcRe = new RegExp(TC_TYPO_RE.source, TC_TYPO_RE.flags);
  while ((match = tcRe.exec(content)) !== null) {
    typos.push({ found: match[0], likelyIntended: `@TC-${match[1]}` });
  }

  return typos;
}

function tagWordsFromText(text) {
  const tags = new Set();
  let match;
  const re = new RegExp(TAG_RE.source, TAG_RE.flags);
  while ((match = re.exec(text)) !== null) tags.add(match[1].toLowerCase());
  return tags;
}

/** Resolves the `test`/`test.describe`/`test.only`/... identifier chain of a
 * CallExpression's callee, e.g. `test.describe.only(...)` -> ['test','describe','only'].
 * Returns null if the callee isn't a plain identifier/property-access chain
 * (e.g. a computed call), which simply means "not a test/describe call". */
function getCallChain(expr) {
  const chain = [];
  let cur = expr;
  while (ts.isPropertyAccessExpression(cur)) {
    chain.unshift(cur.name.text);
    cur = cur.expression;
  }
  if (ts.isIdentifier(cur)) {
    chain.unshift(cur.text);
    return chain;
  }
  return null;
}

/** Extracts the `tag: ['@smoke', ...]` array (Playwright's modern
 * second-argument tag syntax), if present, as raw tag strings. */
function extractTagArrayFromArgs(args) {
  const out = [];
  if (!args || args.length < 2) return out;
  const optionsArg = args[1];
  if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) return out;
  for (const prop of optionsArg.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ((ts.isIdentifier(prop.name) && prop.name.text === 'tag') ||
        (ts.isStringLiteralLike(prop.name) && prop.name.text === 'tag')) &&
      ts.isArrayLiteralExpression(prop.initializer)
    ) {
      for (const el of prop.initializer.elements) {
        if (ts.isStringLiteralLike(el)) out.push(el.text);
      }
    }
  }
  return out;
}

function titleTextOf(args) {
  if (!args || !args.length) return '';
  const first = args[0];
  return first && ts.isStringLiteralLike(first) ? first.text : '';
}

/** Builds one per-test record from the describe-nesting stack + this test's
 * own title/extra tags. Tags on an enclosing describe are inherited by every
 * test nested inside it, combined with the test's own title tags. */
function buildTestRecord(describeStack, title, extraTags) {
  const titlePath = [...describeStack.map((d) => d.title), title].filter((t) => t !== '');
  const combinedTextParts = [];
  for (const d of describeStack) {
    combinedTextParts.push(d.title, ...d.extraTags);
  }
  combinedTextParts.push(title, ...extraTags);
  const combinedText = combinedTextParts.join(' ');

  const tagWords = tagWordsFromText(combinedText);
  const { testCaseIds, businessProcesses } = extractTraceabilityTags(combinedText);
  const tagTypoObjects = findTagTypos(combinedText);

  return {
    titlePath,
    tags: Array.from(tagWords).sort(),
    testCaseId: testCaseIds[0] || null,
    testCaseIds,
    businessProcess: businessProcesses[0] || null,
    businessProcesses,
    tagTypos: tagTypoObjects.map((t) => `${t.found} (did you mean ${t.likelyIntended}?)`),
    tagTypoObjects,
  };
}

const DESCRIBE_MODIFIERS = new Set(['only', 'skip', 'fixme', 'serial', 'parallel']);
const TEST_LEAF_MODIFIERS = new Set(['only', 'skip', 'fixme']);

function walk(node, describeStack, testsOut) {
  if (ts.isCallExpression(node)) {
    const chain = getCallChain(node.expression);
    if (chain && chain[0] === 'test') {
      if (chain[1] === 'describe' && (chain.length === 2 || DESCRIBE_MODIFIERS.has(chain[2]))) {
        const title = titleTextOf(node.arguments);
        const extraTags = extractTagArrayFromArgs(node.arguments);
        const newStack = describeStack.concat([{ title, extraTags }]);
        for (const arg of node.arguments) walk(arg, newStack, testsOut);
        return;
      }
      if (chain.length === 1 || (chain.length === 2 && TEST_LEAF_MODIFIERS.has(chain[1]))) {
        const title = titleTextOf(node.arguments);
        const extraTags = extractTagArrayFromArgs(node.arguments);
        testsOut.push(buildTestRecord(describeStack, title, extraTags));
        for (const arg of node.arguments) walk(arg, describeStack, testsOut);
        return;
      }
    }
  }
  ts.forEachChild(node, (child) => walk(child, describeStack, testsOut));
}

/**
 * AST-based per-test tag scan (v1.6.0). Parses the given spec file with the
 * TypeScript compiler API and returns one record per test() call found,
 * correctly attributing tags found in that specific test's title (and any
 * enclosing describe titles) to that test alone — not to every test in the
 * file, which was the old regex scanner's known limitation.
 *
 * Parse errors and unreadable files are handled defensively: they log a
 * warning and return [] rather than throwing, so one malformed spec file
 * never aborts a whole-suite scan.
 *
 * @param {string} filePath - absolute path to a .spec.ts file
 * @returns {Array<{titlePath:string[], tags:string[], testCaseId:string|null,
 *   testCaseIds:string[], businessProcess:string|null, businessProcesses:string[],
 *   tagTypos:string[], tagTypoObjects:Array<{found:string,likelyIntended:string}>}>}
 */
function scanFileForTestTags(filePath) {
  const content = readFileSafe(filePath);
  if (content === null) return [];
  try {
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const testsOut = [];
    walk(sourceFile, [], testsOut);
    return testsOut;
  } catch (err) {
    console.warn(`[tag-scanner] Failed to parse ${filePath}, skipping: ${err.message}`);
    return [];
  }
}

/**
 * File-level tag list — union of every tag found across all tests in the
 * file. Kept for callers that reasonably still want file-level info (e.g.
 * Explorer's spec-card tag chips).
 * @param {string} filePath - absolute path to a .spec.ts file
 * @returns {string[]} unique, lowercased tags found in the file
 */
function scanFileForTags(filePath) {
  const perTest = scanFileForTestTags(filePath);
  const tags = new Set();
  for (const t of perTest) for (const tag of t.tags) tags.add(tag);
  return Array.from(tags).sort();
}

/**
 * File-level extension of scanFileForTags with @TC-\d+ / @bp:[\w-]+
 * extraction and typo flags — union across all tests in the file (same
 * "kept for file-level consumers" rationale as scanFileForTags()).
 * @param {string} filePath
 * @returns {{tags: string[], testCaseIds: string[], businessProcesses: string[], tagTypos: Array}}
 */
function scanFileForExtendedTags(filePath) {
  const perTest = scanFileForTestTags(filePath);
  if (readFileSafe(filePath) === null) {
    return { tags: [], testCaseIds: [], businessProcesses: [], tagTypos: [] };
  }

  const tags = new Set();
  const testCaseIds = new Set();
  const businessProcesses = new Set();
  const typoKey = (t) => `${t.found} ${t.likelyIntended}`;
  const typoMap = new Map();

  for (const t of perTest) {
    for (const tag of t.tags) tags.add(tag);
    for (const id of t.testCaseIds) testCaseIds.add(id);
    for (const bp of t.businessProcesses) businessProcesses.add(bp);
    for (const typo of t.tagTypoObjects) typoMap.set(typoKey(typo), typo);
  }

  return {
    tags: Array.from(tags).sort(),
    testCaseIds: Array.from(testCaseIds).sort(),
    businessProcesses: Array.from(businessProcesses).sort(),
    tagTypos: Array.from(typoMap.values()),
  };
}

module.exports = {
  scanFileForTags,
  scanFileForExtendedTags,
  scanFileForTestTags,
  extractTraceabilityTags,
  findTagTypos,
};
