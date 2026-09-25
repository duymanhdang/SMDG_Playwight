import { test, expect } from '@playwright/test';
import { AdminFilterRulePage } from '../../../pages/admin/AdminFilterRulePage';
import { MainFilterRuleVerifyPage } from '../../../pages/verify/MainFilterRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { NewRequestForm } from '../../../pages/cr/NewRequestForm';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData, suiteData } from '../suite.config';

const TD = getTestData('fr-e2e-mm-04');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_FILTER_RULE.name;
const R2 = suiteData.filterRules.R2;
const R4 = suiteData.filterRules.R4;

test.describe(
  'FR-E2E-MM-04: Rule Chaining (R2 + R4)',
  { tag: ['@rules', '@filter-rule', '@mm', '@bp:filter-rule'] },
  () => {
    test(
      'R2 Base Unit→Order Unit + R4 Alternative Unit→Unit of Dimension chaining',
      { tag: ['@happy-path', '@TC-08'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const adminPage = await adminCtx.newPage();
        const requestorPage = await requestorCtx.newPage();
        await adminPage.evaluate(() => {
          document.title = '[ADMIN] SimpleMDG';
        });
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR] SimpleMDG';
        });

        const adminFR = new AdminFilterRulePage(adminPage);
        const mainFR = new MainFilterRuleVerifyPage(requestorPage);
        const myRequest = new MyRequestPage(requestorPage);
        const newRequestForm = new NewRequestForm(requestorPage);

        try {
          // ═══════════════════════════════════════════
          // SETUP: Admin creates R2 and R4
          // ═══════════════════════════════════════════
          console.log('\n═══ SETUP: Admin creates R2 + R4 ═══');
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminFR.navigateToFilterRule(TEMPLATE_NAME);
          for (const rule of [R2, R4]) {
            await adminFR.createFilterRule({
              sourceSection: rule.sourceSection,
              sourceField: rule.sourceField,
              targetSection: rule.targetSection,
              targetField: rule.targetField,
              targetProperty: rule.property,
            });
            await adminFR.verifyToast('Business Rule Created');
            console.log(`✅ ${rule.sourceSection}→${rule.targetSection} created`);
          }

          // ═══════════════════════════════════════════
          // TEST: Requestor verifies chaining
          // ═══════════════════════════════════════════
          console.log('\n═══ TEST: Requestor verifies R2+R4 chaining ═══');
          await loginAs(
            requestorPage,
            suiteConfig.accounts.requestor.user,
            suiteConfig.accounts.requestor.pass
          );
          await myRequest.goto();
          await newRequestForm.openNewRequest('Product');
          await newRequestForm.selectTemplate(TEMPLATE_NAME, 'Material Number');

          // Step 1: Set R2 source — Base Unit = BAG in Basic Data
          console.log('\n[1] Setting Base Unit = BAG (R2 source)...');
          await mainFR.navigateToTargetArea('Basic Data');
          await mainFR.clickF4ByLabel('Base Unit of Measure');
          await mainFR.selectF4Value(R2.testValue);
          await mainFR.selectFirstRowInDialog(R2.testValue);

          // Step 2: Verify R2 target — Order Unit is filtered
          console.log('\n[2] Verifying Order Unit filtered (R2 target)...');
          await mainFR.navigateToTargetArea('Purchasing Data');
          await mainFR.clickF4ByLabel('Order Unit');
          await mainFR.verifyColumnValuesInF4Dialog(R2.verifyColumn, R2.testValue);
          await mainFR.selectFirstRowInDialog(R2.testValue);

          // Step 3: Open Units of Measure dialog (R4 — same dialog)
          console.log('\n[3] Opening Units of Measure Add dialog (R4 source)...');
          await mainFR.clickAddButtonBySectionTitle('Units of Measure');
          await mainFR.waitForSection('Units of Measure');

          // Step 4: Set R4 source — Alternative Unit F4
          console.log('\n[4] Setting Alternative Unit (R4 source)...');
          await mainFR.clickF4ByLabel('Alternative Unit');
          await mainFR.selectF4Value(R4.testValue);
          await mainFR.selectFirstRowInDialog(R4.testValue);

          // Step 5: Verify R4 target — Unit of Dimension filtered in same dialog
          console.log('\n[5] Verifying Unit of Dimension filtered (R4 target, same dialog)...');
          await mainFR.clickF4ByLabel('Unit of Dimension');
          await mainFR.verifyColumnValuesInF4Dialog(R4.verifyColumn, R4.testValue);
          await mainFR.selectFirstRowInDialog(R4.testValue);

          // Step 6: Cancel Units of Measure dialog cleanup
          console.log('\n[6] Cleanup...');
          await mainFR.closeAddDialog();

          // ═══════════════════════════════════════════
          // CLEANUP
          // ═══════════════════════════════════════════
          console.log('\n═══ CLEANUP ═══');
          await requestorPage.context().close();
          // Re-navigate to admin page (session may have expired during requestor phase)
          await adminPage.goto(`${process.env.BASE_URL}/admin/index.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await adminPage.waitForTimeout(3000);
          await adminFR.navigateToFilterRule(TEMPLATE_NAME);
          for (const rule of [R2, R4]) {
            await adminFR.deleteFilterRule(rule.sourceSection, rule.targetField);
            console.log(`✅ ${rule.sourceSection}→${rule.targetSection} deleted`);
          }

          console.log('\n══════════════════════════════════════');
          console.log('  ✅ TC-04: RULE CHAINING — ALL CHECKS PASSED');
          console.log('══════════════════════════════════════');
        } finally {
          await adminCtx.close().catch(() => {});
          await requestorCtx.close().catch(() => {});
        }
      }
    );
  }
);
