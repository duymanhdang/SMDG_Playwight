import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { loginAs } from '../../../helpers/auth';
import { AdminMandatoryRulePage } from '../../../pages/admin/AdminMandatoryRulePage';
import { suiteConfig } from '../suite.config';

const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_MANDATORY_RULE.name;

test.describe(
  'MR-E2E-MM-02: Admin Create Rule Dialog - User Attribute Mode',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    test(
      'User Attribute combo, target cascade, cancel',
      { tag: ['@admin', '@happy-path', '@TC-02'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const adminPage = await adminCtx.newPage();
        await adminPage.evaluate(() => {
          document.title = '[ADMIN]';
        });
        const adminMR = new AdminMandatoryRulePage(adminPage);

        try {
          logPhase('PHASE 1', 'ADMIN — Navigate to Mandatory Rule');
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminMR.navigateToMandatoryRule(TEMPLATE_NAME);
          await adminMR.verifyRulePageLoaded();

          logPhase('STEP 1', 'Open Add New dialog and select User Attribute → User ID');
          await adminMR.clickAddNew();
          await adminMR.verifyAddNewDialogVisible();
          await adminMR.selectUserAttribute('User ID');
          await adminMR.selectTargetSection('BASICDIMENSION');
          await adminMR.selectTargetField('volumeUnit');

          logPhase('STEP 2', 'Change User Attribute type → User Group');
          await adminMR.selectUserAttribute('User Group');

          logPhase('STEP 3', 'Cancel dialog');
          await adminMR.cancelAddNewDialog();

          logPhase('DONE', 'TC-02: User Attribute dialog verified');
        } finally {
          // no rules created, nothing to clean
        }
      }
    );
  }
);
