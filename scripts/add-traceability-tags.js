/**
 * add-traceability-tags.js — one-off maintenance script.
 *
 * Adds §6.3 traceability tags to all spec files under suites (each suite's
 * e2e folder) so the dashboard's
 * tag-scanner (dashboard/tag-scanner.js) can build the Coverage matrix and
 * tag-adoption report:
 *   - @bp:<process>  added to every test.describe() tag array (inherited by
 *                    every test nested inside it) and to stray top-level tests;
 *   - @TC-<nn>       added to every test() tag array, unique per suite.
 *
 * Uses the dashboard's pinned TypeScript 5.6.x compiler API (the root
 * project's typescript is the native 7.x rewrite with a different API).
 *
 * Idempotent: skips any call whose tag array already carries an @bp:/@TC- tag.
 * TC numbering: per-suite running counter in alphabetical file order, snapped
 * to the file's single unambiguous "E2E-TC<n>" header reference when present.
 *
 * Usage:  node scripts/add-traceability-tags.js [--dry-run]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUITES_DIR = path.join(ROOT, 'suites');
const ts = require(path.join(ROOT, 'dashboard', 'node_modules', 'typescript'));

const DRY_RUN = process.argv.includes('--dry-run');

// One business process per suite — these become the Coverage matrix groups.
const BP_BY_SUITE = {
  S4_QAS_AUTO_BP01: 'bp-cr-lifecycle',
  S4_QAS_AUTO_MM01: 'mm-cr-lifecycle',
  S4_QAS_AUTO_MM01_ASSIGNMENT_RULE: 'assignment-rule',
  S4_QAS_AUTO_MM01_DUPLICATION_RULE: 'duplication-rule',
  S4_QAS_AUTO_MM01_EDITABLE_RULE: 'editable-rule',
  S4_QAS_AUTO_MM01_FILTER_RULE: 'filter-rule',
  S4_QAS_AUTO_MM01_MANDATORY_RULE: 'mandatory-rule',
  S4_QAS_AUTO_MM01_VISIBLE_RULE: 'visible-rule',
  S4_QAS_DUP_AUTO_BP01: 'bp-duplication-check',
  S4_QAS_DUP_AUTO_MM01: 'mm-duplication-check',
  S4_QAS_MASS_AUTO_BP01: 'bp-mass-upload',
  S4_QAS_MASS_DUP_BP01: 'bp-mass-upload-duplication',
  S4_QAS_MASS_DUP_MM01: 'mm-mass-upload-duplication',
  S4_QAS_MASS_MM01: 'mm-mass-upload',
  S4_QAS_MM01_ATTACHMENTS: 'mm-attachments',
  S4_QAS_MM01_COMMENT_LOGO: 'mm-comment-logo',
  S4_QAS_MM01_HYPERLINK: 'mm-hyperlink',
  S4_QAS_MUL_AUTO_BP01: 'bp-multi-process',
  S4_QAS_MUL_MM01: 'mm-multi-process',
  S4_QAS_NPI: 'npi',
  S4_QAS_SEARCH_MD: 'search-master-data',
};

const DESCRIBE_MODIFIERS = new Set(['only', 'skip', 'fixme', 'serial', 'parallel']);
const TEST_LEAF_MODIFIERS = new Set(['only', 'skip', 'fixme']);

function listSpecFiles(suiteDir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.spec.ts')) out.push(full);
    }
  };
  walk(suiteDir);
  return out.sort();
}

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

function isTagProperty(prop) {
  return (
    ts.isPropertyAssignment(prop) &&
    (ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)) &&
    prop.name.text === 'tag'
  );
}

function getTagArray(node) {
  const args = node.arguments;
  if (args.length >= 2 && ts.isObjectLiteralExpression(args[1])) {
    for (const prop of args[1].properties) {
      if (isTagProperty(prop) && ts.isArrayLiteralExpression(prop.initializer)) {
        return prop.initializer;
      }
    }
  }
  return null;
}

function tagValuesOf(node) {
  const arr = getTagArray(node);
  if (!arr) return [];
  return arr.elements.filter((e) => ts.isStringLiteralLike(e)).map((e) => e.text);
}

/** Walks the file and returns { targets, parseError }. Targets are describe and
 * leaf-test calls in source order, with a flag for stray (non-describe) tests. */
function analyzeFile(sourceFile) {
  const targets = [];
  const walk = (node, insideDescribe) => {
    if (ts.isCallExpression(node)) {
      const chain = getCallChain(node.expression);
      if (chain && chain[0] === 'test') {
        const isDescribe =
          chain[1] === 'describe' && (chain.length === 2 || DESCRIBE_MODIFIERS.has(chain[2]));
        const isLeaf = chain.length === 1 || (chain.length === 2 && TEST_LEAF_MODIFIERS.has(chain[1]));
        if (isDescribe) {
          targets.push({ isDescribe: true, node });
          for (const arg of node.arguments) walk(arg, true);
          return;
        }
        if (isLeaf) {
          targets.push({ isDescribe: false, node, strayBp: !insideDescribe });
          for (const arg of node.arguments) walk(arg, insideDescribe);
          return;
        }
      }
    }
    ts.forEachChild(node, (child) => walk(child, insideDescribe));
  };
  walk(sourceFile, false);
  return { targets };
}

/** Builds the single insertion edit that adds `tags` to the given call. */
function buildEdit(node, tags, edits) {
  const args = node.arguments;
  const tagText = tags.map((t) => `'${t}'`).join(', ');
  if (args.length >= 2 && ts.isObjectLiteralExpression(args[1])) {
    const obj = args[1];
    for (const prop of obj.properties) {
      if (isTagProperty(prop) && ts.isArrayLiteralExpression(prop.initializer)) {
        const arr = prop.initializer;
        const els = arr.elements;
        edits.push({
          start: els.length ? els[els.length - 1].end : arr.getStart() + 1,
          length: 0,
          text: `${els.length ? ', ' : ''}${tagText}`,
        });
        return;
      }
    }
    edits.push({
      start: obj.getEnd() - 1,
      length: 0,
      text: `${obj.properties.length ? ', ' : ''}tag: [${tagText}]`,
    });
  } else if (args.length >= 2) {
    edits.push({ start: args[1].getStart(), length: 0, text: `{ tag: [${tagText}] }, ` });
  }
}

function applyEdits(content, edits) {
  edits.sort((a, b) => a.start - b.start);
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i];
    content = content.slice(0, e.start) + e.text + content.slice(e.start + e.length);
  }
  return content;
}

function padTC(n) {
  return n < 100 ? String(n).padStart(2, '0') : String(n);
}

function distinctE2ETC(content) {
  const set = new Set();
  const re = /E2E-TC(\d+)/g;
  let m;
  while ((m = re.exec(content)) !== null) set.add(Number(m[1]));
  return Array.from(set).sort((a, b) => a - b);
}

function main() {
  const suites = fs
    .readdirSync(SUITES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let filesTouched = 0;
  let totalTC = 0;
  let totalBP = 0;
  let parseErrors = 0;

  for (const suite of suites) {
    const bpName = BP_BY_SUITE[suite];
    if (!bpName) {
      console.warn(`[warn] no BP mapping for suite: ${suite}`);
      continue;
    }
    const files = listSpecFiles(path.join(SUITES_DIR, suite));
    if (files.length === 0) continue;

    let counter = 0;
    let suiteTC = 0;
    let suiteBP = 0;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');

      // Snap the per-suite counter to this file's single unambiguous E2E-TC reference.
      const e2eNums = distinctE2ETC(content);
      if (e2eNums.length === 1) counter = Math.max(counter, e2eNums[0]);

      const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const { targets } = analyzeFile(sourceFile);

      const edits = [];
      let fileTC = 0;
      let fileBP = 0;

      for (const t of targets) {
        if (t.isDescribe) {
          const values = tagValuesOf(t.node);
          if (!values.some((v) => v.startsWith('@bp:'))) {
            buildEdit(t.node, [`@bp:${bpName}`], edits);
            fileBP++;
          }
        } else {
          const values = tagValuesOf(t.node);
          const tags = [];
          if (!values.some((v) => v.startsWith('@TC-'))) {
            tags.push(`@TC-${padTC(counter)}`);
            counter++;
            fileTC++;
          }
          if (t.strayBp && !values.some((v) => v.startsWith('@bp:'))) {
            tags.push(`@bp:${bpName}`);
            fileBP++;
          }
          if (tags.length) buildEdit(t.node, tags, edits);
        }
      }

      if (edits.length) {
        if (!DRY_RUN) fs.writeFileSync(file, applyEdits(content, edits), 'utf8');
        filesTouched++;
        totalTC += fileTC;
        totalBP += fileBP;
        suiteTC += fileTC;
        suiteBP += fileBP;
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        console.log(
          `[${DRY_RUN ? 'would' : 'ok'}] ${rel}  +${fileBP} @bp:  +${fileTC} @TC-`
        );
      }
    }

    if (suiteTC || suiteBP) {
      console.log(`  -> ${suite}: +${suiteBP} @bp:, +${suiteTC} @TC- (counter ended at ${counter})`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`suites processed : ${suites.length}`);
  console.log(`files touched    : ${filesTouched}`);
  console.log(`@bp: inserted    : ${totalBP}`);
  console.log(`@TC- inserted    : ${totalTC}`);
  console.log(`mode             : ${DRY_RUN ? 'dry-run (no writes)' : 'write'}`);
}

main();
