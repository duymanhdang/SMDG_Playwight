import { test, expect } from '@playwright/test';
import { AdminEditableRulePage } from '../../../pages/admin/AdminEditableRulePage';
import { loginAs } from '../../../helpers/auth';
import { logPhase } from '../../../helpers/utils';
import { suiteConfig, getTestData } from '../suite.config';

const TD = getTestData('er-e2e-mm-01');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-01: Admin View/Search & List Utilities',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'Verify navigation, UI elements, search field, Add New dialog, Process Designer tab',
      { tag: ['@admin', '@happy-path', '@TC-00'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await ctx.newPage();
        const adminER = new AdminEditableRulePage(page);

        try {
          await loginAs(page, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);

          logPhase('PHASE 1', 'Navigate to Editable Rule via Process Designer');
          await adminER.navigateToEditableRule(TEMPLATE_NAME);

          logPhase('PHASE 2', 'Verify all UI elements present');
          await adminER.verifyRulePageLoaded();
          await adminER.verifySearchFieldVisible();
          await adminER.verifyRuleTableVisible();

          logPhase('PHASE 3', 'Verify Add New dialog can be opened and cancelled');
          await adminER.clickAddNew();
          await adminER.verifyAddNewDialogVisible();
          await adminER.cancelAddNewDialog();

          logPhase('PHASE 4', 'Verify Process Designer tab accessible from admin');
          await adminER.navigateToAdmin();
          await adminER.verifyProcessDesignerTabVisible();
        } finally {
          await ctx.close();
        }
      }
    );
  }
);
