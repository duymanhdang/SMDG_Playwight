import { test, expect } from '@playwright/test';
import { AdminFilterRulePage } from '../../../pages/admin/AdminFilterRulePage';
import { MainFilterRuleVerifyPage } from '../../../pages/verify/MainFilterRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { NewRequestForm } from '../../../pages/cr/NewRequestForm';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData, suiteData } from '../suite.config';

const TD = getTestData('fr-e2e-mm-08');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_FILTER_RULE.name;
const R3 = suiteData.filterRules.R3;

test.describe(
  'FR-E2E-MM-08: Multiple Entries',
  { tag: ['@rules', '@filter-rule', '@mm', '@bp:filter-rule'] },
  () => {
    test(
      'R3: Add multiple Classification entries — FOOD then MODELS',
      { tag: ['@happy-path', '@TC-14'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const adminPage = await adminCtx.newPage();
        const requestorPage = await requestorCtx.newPage();
        await adminPage.evaluate(() => {
          document.title = '[ADMIN]';
        });
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR]';
        });

        const adminFR = new AdminFilterRulePage(adminPage);
        const mainFR = new MainFilterRuleVerifyPage(requestorPage);
        const myRequest = new MyRequestPage(requestorPage);
        const newRequestForm = new NewRequestForm(requestorPage);

        try {
          // ═══════════════════════════════════════════
          // SETUP: Admin creates R3
          // ═══════════════════════════════════════════
          console.log('\n═══ SETUP: Admin creates R3 (Class→Characteristic) ═══');
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminFR.navigateToFilterRule(TEMPLATE_NAME);
          await adminFR.createFilterRule({
            sourceSection: R3.sourceSection,
            sourceField: R3.sourceField,
            targetSection: R3.targetSection,
            targetField: R3.targetField,
            targetProperty: R3.property,
          });
          await adminFR.verifyToast('Business Rule Created');
          console.log('✅ R3 created');

          // ═══════════════════════════════════════════
          // TEST: Multiple Classification entries
          // ═══════════════════════════════════════════
          console.log('\n═══ TEST: Multiple Classification entries with Class=FOOD ═══');
          await loginAs(
            requestorPage,
            suiteConfig.accounts.requestor.user,
            suiteConfig.accounts.requestor.pass
          );
          await myRequest.goto();
          await newRequestForm.openNewRequest('Product');
          await newRequestForm.selectTemplate(TEMPLATE_NAME, 'Material Number');

          // ── Entry 1: First Classification row ──
          console.log('\n[1] Adding first Classification entry...');
          await mainFR.clickAddButtonBySectionTitle('Classification');
          await mainFR.waitForSection('Classification');
          await mainFR.clickF4ByLabel('Class');
          await mainFR.selectF4Value(R3.testValue);
          await mainFR.selectFirstRowInDialog(R3.testValue);

          // Click Add icon to open Characteristic sub-dialog
          await mainFR.clickAddIconInDialog();
          await mainFR.page.waitForTimeout(1000);

          // Verify Characteristic F4 is filtered
          await mainFR.clickF4ByLabel('Characteristic');
          await mainFR.verifyColumnValuesInF4Dialog(R3.verifyColumn, R3.testValue);
          await mainFR.selectFirstRowInDialog(R3.testValue);

          // Close Characteristic sub-dialog
          await mainFR.closeAddDialog();

          // ── Entry 2: Second Classification row ──
          console.log('\n[2] Adding second Classification entry (MODELS)...');
          // Close the first Classification dialog (Cancel)
          await mainFR.closeAddDialog();

          // Open Classification section again for second entry
          await mainFR.clickAddButtonBySectionTitle('Classification');
          await mainFR.waitForSection('Classification');
          await mainFR.clickF4ByLabel('Class');
          await mainFR.selectF4Value(R3.testValue2);
          await mainFR.selectFirstRowInDialog(R3.testValue2);

          await mainFR.clickAddIconInDialog();
          await mainFR.page.waitForTimeout(1000);

          await mainFR.clickF4ByLabel('Characteristic');
          await mainFR.verifyColumnValuesInF4Dialog(R3.verifyColumn, R3.testValue2);
          await mainFR.selectFirstRowInDialog(R3.testValue2);

          // Cleanup: close remaining dialogs
          await mainFR.closeAddDialog();
          await mainFR.closeAddDialog();

          console.log('✅ Multiple Classification entries verified');

          // ═══════════════════════════════════════════
          // CLEANUP
          // ═══════════════════════════════════════════
          console.log('\n═══ CLEANUP ═══');
          await requestorPage.context().close();
          await adminPage.goto(`${process.env.BASE_URL}/admin/index.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await adminPage.waitForTimeout(3000);
          await adminFR.navigateToFilterRule(TEMPLATE_NAME);
          await adminFR.deleteFilterRule(R3.sourceSection, R3.targetField);
          console.log('✅ R3 deleted');

          console.log('\n══════════════════════════════════════');
          console.log('  ✅ TC-08: MULTIPLE ENTRIES — ALL CHECKS PASSED');
          console.log('══════════════════════════════════════');
        } finally {
          await adminCtx.close().catch(() => {});
          await requestorCtx.close().catch(() => {});
        }
      }
    );
  }
);
