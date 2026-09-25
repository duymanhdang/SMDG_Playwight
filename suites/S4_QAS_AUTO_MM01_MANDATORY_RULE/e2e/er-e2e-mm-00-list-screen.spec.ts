import { test, expect } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { loginAs } from '../../../helpers/auth';
import { AdminMandatoryRulePage } from '../../../pages/admin/AdminMandatoryRulePage';
import { safeDeleteMandatoryRule } from '../../../helpers/domain';
import { suiteConfig, generateTimestamp } from '../suite.config';

const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_MANDATORY_RULE.name;

test.describe(
  'MR-E2E-MM-00: List/Search/Delete Screen',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    test(
      'Search bar, delete confirmation, toggle state, sort, empty state',
      { tag: ['@admin', '@happy-path', '@TC-00'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const adminPage = await adminCtx.newPage();
        await adminPage.evaluate(() => {
          document.title = '[ADMIN]';
        });
        const adminMR = new AdminMandatoryRulePage(adminPage);
        const fieldsToClean: string[] = [];

        try {
          logPhase('PHASE 1', 'ADMIN — Navigate to Mandatory Rule page');
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminMR.navigateToMandatoryRule(TEMPLATE_NAME);
          await adminMR.verifyRulePageLoaded();

          logPhase('STEP 1', 'Verify page elements: Add New, Search, Table');
          await adminMR.verifySearchFieldVisible();
          await adminMR.verifyRuleTableVisible();

          logPhase('STEP 2', 'Create a rule to test with');
          await adminMR.clickAddNew();
          await adminMR.verifyAddNewDialogVisible();
          await adminMR.selectSourceSection('BASICGENERAL');
          await adminMR.selectSourceField('productOldID');
          await adminMR.selectTargetSection('BASICDIMENSION');
          await adminMR.selectTargetField('weightUnit');
          await adminMR.fillSourceValue('12345');
          await adminMR.clickAddRule();
          await adminMR.verifyToast('Business Rule Created');
          fieldsToClean.push('weightUnit');

          logPhase('STEP 3', 'Search by target field name');
          await adminMR.searchRule('weightUnit');
          await adminMR.verifyRuleInList('weightUnit');

          logPhase('STEP 4', 'Search by non-existent keyword');
          await adminMR.searchRule('ZZ_NONEXISTENT');
          const row = adminMR.page.locator('[role="row"]').filter({ hasText: 'ZZ_NONEXISTENT' });
          await expect(row.first()).not.toBeVisible({ timeout: 5000 });

          logPhase('STEP 5', 'Toggle rule state');
          await adminMR.searchRule('weightUnit');
          await adminMR.toggleRuleState(0);

          logPhase('STEP 6', 'Delete rule with confirmation');
          await adminMR.searchRule('weightUnit');
          await adminMR.deleteRule('weightUnit');
          await adminMR.verifyRulePageLoaded();
          // isVisible() is a one-shot check — it can catch the list mid-refresh
          // right after delete (backend delete + table re-render isn't instant),
          // which is why this only flaked in automation, never by hand (manual
          // clicking naturally leaves enough time between steps). Use a
          // web-first assertion instead — it retries until the row is actually
          // gone or the timeout elapses.
          await expect(
            adminMR.page.locator('[role="row"]').filter({ hasText: 'weightUnit' }).first()
          ).not.toBeVisible({ timeout: 15000 });
          fieldsToClean.pop();

          logPhase('DONE', 'TC-00: List screen verified');
        } finally {
          for (const f of fieldsToClean) {
            await safeDeleteMandatoryRule(adminMR, f);
          }
        }
      }
    );
  }
);
