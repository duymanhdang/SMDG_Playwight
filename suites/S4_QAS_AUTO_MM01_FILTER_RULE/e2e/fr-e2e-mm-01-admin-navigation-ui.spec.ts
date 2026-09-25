import { test, expect } from '@playwright/test';
import { AdminFilterRulePage } from '../../../pages/admin/AdminFilterRulePage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData } from '../suite.config';

const TD = getTestData('fr-e2e-mm-01');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_FILTER_RULE.name;

test.describe(
  'FR-E2E-MM-01: Admin - Navigation & UI',
  { tag: ['@rules', '@filter-rule', '@mm', '@bp:filter-rule'] },
  () => {
    test(
      'Admin: Verify Filter Rule page navigation and all UI elements are present',
      { tag: ['@admin', '@TC-00'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await ctx.newPage();
        const adminFR = new AdminFilterRulePage(page);

        try {
          console.log('\n══════════════════════════════════════');
          console.log('  TC-01: Admin — Navigation & UI');
          console.log('══════════════════════════════════════');

          // Step 1: Admin login
          await loginAs(page, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
          console.log('✅ [TC-01] Admin logged in');

          // Step 2: Navigate to Filter Rule page (covers full navigation path)
          await adminFR.navigateToFilterRule(TEMPLATE_NAME);
          console.log('✅ [TC-01] Navigated to Filter Rule page');

          // Step 3: Verify all UI elements are present
          await adminFR.verifyFilterRulePageLoaded();
          await adminFR.verifySearchFieldVisible();
          await adminFR.verifyRuleTableVisible();
          console.log('✅ [TC-01] All UI elements verified');

          // Step 4: Verify Add New dialog can be opened and cancelled
          await adminFR.clickAddNew();
          await adminFR.verifyAddNewDialogVisible();
          await adminFR.cancelAddNewDialog();
          console.log('✅ [TC-01] Add New dialog opens and cancels correctly');

          // Step 5: Verify Process Designer tab accessible from admin
          await adminFR.navigateToAdmin();
          await adminFR.verifyProcessDesignerTabVisible();
          console.log('✅ [TC-01] Process Designer tab visible from admin homepage');

          console.log('\n══════════════════════════════════════');
          console.log('  ✅ TC-01: ADMIN NAVIGATION & UI — ALL CHECKS PASSED');
          console.log('══════════════════════════════════════');
        } finally {
          await ctx.close();
        }
      }
    );
  }
);
