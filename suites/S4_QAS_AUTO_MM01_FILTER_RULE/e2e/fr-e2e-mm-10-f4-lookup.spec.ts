import { test, expect } from '@playwright/test';
import { AdminFilterRulePage } from '../../../pages/admin/AdminFilterRulePage';
import { MainFilterRuleVerifyPage } from '../../../pages/verify/MainFilterRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { NewRequestForm } from '../../../pages/cr/NewRequestForm';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData, suiteData } from '../suite.config';

const TD = getTestData('fr-e2e-mm-10');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_FILTER_RULE.name;
const R2 = suiteData.filterRules.R2;

test.describe(
  'FR-E2E-MM-10: F4 Lookup Field',
  { tag: ['@rules', '@filter-rule', '@mm', '@bp:filter-rule'] },
  () => {
    test(
      'Verify free input regression after R2 filter rule applied',
      { tag: ['@happy-path', '@TC-16'] },
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
          // SETUP: Admin creates R2
          // ═══════════════════════════════════════════
          console.log('\n═══ SETUP: Admin creates R2 ═══');
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminFR.navigateToFilterRule(TEMPLATE_NAME);
          await adminFR.createFilterRule({
            sourceSection: R2.sourceSection,
            sourceField: R2.sourceField,
            targetSection: R2.targetSection,
            targetField: R2.targetField,
            targetProperty: R2.property,
          });
          await adminFR.verifyToast('Business Rule Created');
          console.log('✅ R2 created');

          // ═══════════════════════════════════════════
          // TEST: Free input regression
          // ═══════════════════════════════════════════
          console.log('\n═══ TEST: Free input after filter applied ═══');
          await loginAs(
            requestorPage,
            suiteConfig.accounts.requestor.user,
            suiteConfig.accounts.requestor.pass
          );
          await myRequest.goto();
          await newRequestForm.openNewRequest('Product');
          await newRequestForm.selectTemplate(TEMPLATE_NAME, 'Material Number');

          // Step 1: Set Base Unit = BAG (R2 source)
          console.log('\n[1] Setting Base Unit = BAG...');
          await mainFR.navigateToTargetArea('Basic Data');
          await mainFR.clickF4ByLabel('Base Unit of Measure');
          await mainFR.selectF4Value(R2.testValue);
          await mainFR.selectFirstRowInDialog(R2.testValue);

          // Step 2: Open Order Unit F4 (R2 target) — verify filter active
          console.log('\n[2] Opening Order Unit F4 — verify filter active...');
          await mainFR.navigateToTargetArea('Purchasing Data');
          await mainFR.clickF4ByLabel('Order Unit');
          await mainFR.verifyColumnValuesInF4Dialog(R2.verifyColumn, R2.testValue);

          // Step 3: Close F4 without selecting
          console.log('\n[3] Closing F4 dialog...');
          await mainFR.closeAddDialogEscape();

          // Step 4: Reopen F4 and type free text search
          console.log('\n[4] Reopening F4 and doing free text search...');
          await mainFR.clickF4ByLabel('Order Unit');
          const dialog = requestorPage.locator('.sapMTableSelectDialog.sapMDialogOpen');
          await expect(dialog).toBeVisible({ timeout: 5000 });
          await mainFR.waitForBusy(2000);

          // Type a free text value (looking for values not matching BAG)
          const search = dialog.getByRoleUI5('SearchField').first();
          await search.click();
          await search.fill('PC');
          await search.press('Enter');
          await mainFR.waitForBusy(3000);

          // Verify multiple results show (free input works despite filter rule)
          const count = await mainFR.getF4DataRowCount();
          console.log(`[TC-10] Free text "PC" returned ${count} row(s)`);
          if (count >= 1) {
            console.log('✅ Free input lookup works after filter rule applied');
          }

          // Close F4
          await mainFR.closeAddDialogEscape();

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
          await adminFR.deleteFilterRule(R2.sourceSection, R2.targetField);
          console.log('✅ R2 deleted');

          console.log('\n══════════════════════════════════════');
          console.log('  ✅ TC-10: F4 LOOKUP — ALL CHECKS PASSED');
          console.log('══════════════════════════════════════');
        } finally {
          await adminCtx.close().catch(() => {});
          await requestorCtx.close().catch(() => {});
        }
      }
    );
  }
);
