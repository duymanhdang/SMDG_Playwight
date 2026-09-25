import { test, Page } from '@playwright/test';
import { AdminFilterRulePage } from '../../../pages/admin/AdminFilterRulePage';
import { MainFilterRuleVerifyPage } from '../../../pages/verify/MainFilterRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { NewRequestForm } from '../../../pages/cr/NewRequestForm';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, suiteData } from '../suite.config';

const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_FILTER_RULE.name;
const FILTER_RULES = suiteData.filterRules as Record<string, any>;

let page: Page;
let adminPage: Page;
let adminFR: AdminFilterRulePage;

test.describe(
  'FR-E2E-MM-03: Main - Verify Filter Rules (no submit)',
  { tag: ['@rules', '@filter-rule', '@mm', '@bp:filter-rule'] },
  () => {
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(suiteConfig.timeouts.e2eTest);

      // Create both contexts upfront (parallel pattern)
      const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

      adminPage = await adminCtx.newPage();
      await adminPage.evaluate(() => {
        document.title = '[ADMIN] SimpleMDG';
      });
      adminFR = new AdminFilterRulePage(adminPage);

      page = await ctx.newPage();
      const myRequest = new MyRequestPage(page);
      const newRequestForm = new NewRequestForm(page);

      // ── PHASE 1: ADMIN — Create all filter rules ──
      console.log('\n╔══════════════════════════════════════════════════════════════════╗');
      console.log('║  PHASE 1: ADMIN — Create Filter Rules R1-R6');
      console.log('╚══════════════════════════════════════════════════════════════════╝');

      await loginAs(adminPage, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
      await adminFR.navigateToFilterRule(TEMPLATE_NAME);

      for (const [key, rule] of Object.entries(FILTER_RULES)) {
        console.log(`\n[Setup] Admin creating ${key}...`);
        await adminFR.createFilterRule({
          sourceSection: rule.sourceSection,
          sourceField: rule.sourceField,
          targetSection: rule.targetSection,
          targetField: rule.targetField,
          targetProperty: rule.property,
        });
        await adminFR.verifyToast('Business Rule Created');
      }
      console.log('\n✅ PHASE 1 COMPLETE — All 6 rules created by Admin');

      // ── PHASE 2: REQUESTOR — Open New Request form ──
      console.log('\n╔══════════════════════════════════════════════════════════════════╗');
      console.log('║  TC-03: New Request — Verify Filter Rules (no submit)');
      console.log('║  Flow: Source F4 → Select value → Target F4 → Verify filtered column');
      console.log('╚══════════════════════════════════════════════════════════════════╝');

      await loginAs(page, suiteConfig.accounts.requestor.user, suiteConfig.accounts.requestor.pass);
      await myRequest.goto();
      await newRequestForm.openNewRequest('Product');
      await newRequestForm.selectTemplate(TEMPLATE_NAME, 'Material Number');
    });

    test(
      'R1: Plant Data/Plant → Lot Size Data/Storage Costs Code',
      { tag: ['@happy-path', '@TC-02'] },
      async () => {
        await verifySingleRule(new MainFilterRuleVerifyPage(page), FILTER_RULES.R1, '1');
      }
    );

    test(
      'R2: Basic Data/Base Unit → Purchasing Data/Order Unit',
      { tag: ['@happy-path', '@TC-03'] },
      async () => {
        await verifySingleRule(new MainFilterRuleVerifyPage(page), FILTER_RULES.R2, '2');
      }
    );

    test(
      'R3: Classification/Class → Characteristic',
      { tag: ['@happy-path', '@TC-04'] },
      async () => {
        await verifySingleRule(new MainFilterRuleVerifyPage(page), FILTER_RULES.R3, '3');
      }
    );

    test(
      'R4: Units of Measure/Alternative Unit → Unit of Dimension (same dialog)',
      { tag: ['@admin', '@TC-05'] },
      async () => {
        await verifySingleRule(new MainFilterRuleVerifyPage(page), FILTER_RULES.R4, '4');
      }
    );

    test(
      'R5: Plant Data/Plant → Plant Data/Storage Location/Plant (targetNeedsAdd)',
      { tag: ['@happy-path', '@TC-06'] },
      async () => {
        await verifySingleRule(new MainFilterRuleVerifyPage(page), FILTER_RULES.R5, '5');
      }
    );

    test(
      'R6: Warehouse Data/Warehouse Number → Storage strategies/Stock removal',
      { tag: ['@happy-path', '@TC-07'] },
      async () => {
        await verifySingleRule(new MainFilterRuleVerifyPage(page), FILTER_RULES.R6, '6');
      }
    );

    test.afterAll(async () => {
      // ── Requestor cleanup ──
      if (page) {
        await page.context().close();
      }

      // ── PHASE 3: ADMIN — Delete all filter rules ──
      try {
        if (adminPage) {
          console.log('\n╔══════════════════════════════════════════════════════════════════╗');
          console.log('║  PHASE 3: ADMIN — Delete Filter Rules R1-R6 (cleanup)');
          console.log('╚══════════════════════════════════════════════════════════════════╝');

          await adminPage.goto(`${process.env.BASE_URL}/admin/index.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await adminPage.waitForTimeout(3000);
          await adminFR.navigateToFilterRule(TEMPLATE_NAME);
          for (const [key, rule] of Object.entries(FILTER_RULES)) {
            console.log(`[Cleanup] Admin deleting ${key}...`);
            await adminFR.deleteFilterRule(rule.sourceSection, rule.targetField);
          }
          console.log('\n✅ PHASE 3 COMPLETE — All 6 rules deleted by Admin');
        }
      } catch (e) {
        console.log(
          `[Cleanup] Admin cleanup error (non-fatal): ${e instanceof Error ? e.message : e}`
        );
      }

      if (adminPage) {
        await adminPage.context().close();
      }
    });
  }
);

async function verifySingleRule(
  mainFR: MainFilterRuleVerifyPage,
  rule: any,
  num: string
): Promise<void> {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(
    `║  R${num}: "${rule.sourceSection}.${rule.sourceField}" → "${rule.targetSection}.${rule.targetField}"`
  );
  console.log(`║  Source value: "${rule.testValue}"  |  Verify column: "${rule.verifyColumn}"`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);

  // PHASE 1: SOURCE — Set the source field value
  if (rule.sourceSectionTitle && rule.sourceAddIndex !== null) {
    console.log(`\n[1a] Click Add in "${rule.sourceSectionTitle}" → dialog opens`);
    await mainFR.clickAddButtonBySectionTitle(rule.sourceSectionTitle);
  } else if (rule.sourceTab) {
    console.log(`\n[1a] Navigate to source section "${rule.sourceTab}"`);
    await mainFR.navigateToTargetArea(rule.sourceTab);
  }

  console.log(`\n[1b] Click F4 for "${rule.sourceLabel}" → opens F4 dialog`);
  await mainFR.clickF4ByLabel(rule.sourceLabel);

  console.log(`\n[1c] Search "${rule.testValue}" in F4`);
  await mainFR.selectF4Value(rule.testValue);

  console.log(`\n[1d] Select row "${rule.testValue}" → F4 closes automatically`);
  await mainFR.selectFirstRowInDialog(rule.testValue);

  if (rule.nestedAdd) {
    console.log(`\n[1e] Click Add icon → Characteristic sub-dialog opens (target inside)`);
    await mainFR.clickAddIconInDialog();
    await mainFR.page.waitForTimeout(1000);
  }

  // PHASE 2: TARGET — Verify filtered values
  console.log(`\n── PHASE 2: TARGET — Verify "${rule.targetLabel}" F4 is filtered ──`);
  console.log(`  Expected: "${rule.verifyColumn}" column = "${rule.testValue}"`);

  if (rule.targetTab) {
    console.log(`\n[2a] Navigate to target tab "${rule.targetTab}"`);
    await mainFR.navigateToTargetArea(rule.targetTab);
  }

  if (rule.targetNeedsAdd) {
    console.log(`\n[2b] Click Add in "${rule.targetSectionTitle}" → dialog opens`);
    await mainFR.clickAddButtonBySectionTitle(rule.targetSectionTitle);
  }

  console.log(`\n[2c] Click F4 for "${rule.targetLabel}"`);
  await mainFR.clickF4ByLabel(rule.targetLabel);

  console.log(`\n[2d] 🔍 VERIFY FILTER: column "${rule.verifyColumn}" = "${rule.testValue}"`);
  await mainFR.verifyColumnValuesInF4Dialog(rule.verifyColumn, rule.testValue);

  console.log(`\n[2e] Select row "${rule.testValue}" → F4 closes automatically`);
  await mainFR.selectFirstRowInDialog(rule.testValue);

  // PHASE 3: CLEANUP
  console.log(`\n── PHASE 3: CLEANUP ────────────────────────────────────────────`);
  if (rule.nestedAdd) {
    console.log(`[3a] Cancel Characteristic sub-dialog`);
    await mainFR.closeAddDialog();
    console.log(`[3b] Cancel Classification dialog`);
    await mainFR.closeAddDialog();
  } else if (rule.sameDialog) {
    console.log(`[3c] Cancel Units of Measure dialog`);
    await mainFR.closeAddDialog();
  } else if (rule.targetNeedsAdd) {
    console.log(`[3e] Cancel "${rule.targetSectionTitle}" sub-dialog`);
    await mainFR.closeAddDialog();
    console.log(`[3f] Cancel "${rule.sourceSectionTitle}" parent dialog`);
    await mainFR.closeAddDialog();
  } else if (rule.sourceAddIndex !== null) {
    console.log(`[3d] Cancel "${rule.sourceSectionTitle}" dialog`);
    await mainFR.closeAddDialog();
  }

  console.log(
    `\n✅  R${num} VERIFIED: "${rule.sourceLabel}=${rule.testValue}" → "${rule.targetLabel}" filtered`
  );
  console.log(`   Column "${rule.verifyColumn}" = "${rule.testValue}" ✓`);
}
