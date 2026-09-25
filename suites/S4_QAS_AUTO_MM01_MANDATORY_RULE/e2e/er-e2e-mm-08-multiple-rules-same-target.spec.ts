import { test, expect } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { loginAs } from '../../../helpers/auth';
import { AdminMandatoryRulePage } from '../../../pages/admin/AdminMandatoryRulePage';

import { suiteConfig } from '../suite.config';

const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_MANDATORY_RULE.name;

test.describe(
  'MR-E2E-MM-08: Multiple Rules - Same Target',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    test(
      'Create 2 rules with different sources, same target, verify list',
      { tag: ['@admin', '@TC-09'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const adminPage = await adminCtx.newPage();
        await adminPage.evaluate(() => {
          document.title = '[ADMIN]';
        });
        const adminMR = new AdminMandatoryRulePage(adminPage);

        try {
          logPhase('PHASE 1', 'ADMIN — Login + Navigate');
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminMR.navigateToMandatoryRule(TEMPLATE_NAME);
          await adminMR.verifyRulePageLoaded();

          logPhase('PHASE 2', 'Create Rule A: source value 11111');
          await adminMR.clickAddNew();
          await adminMR.verifyAddNewDialogVisible();
          await adminMR.selectSourceSection('BASICGENERAL');
          await adminMR.selectSourceField('productOldID');
          await adminMR.selectTargetSection('BASICDIMENSION');
          await adminMR.selectTargetField('weightUnit');
          await adminMR.fillSourceValue('11111');
          await adminMR.clickAddRule();
          await adminMR.verifyToast('Business Rule Created');

          logPhase('PHASE 3', 'Create Rule B: different source (INPUT), same target');
          await adminMR.clickAddNew();
          await adminMR.verifyAddNewDialogVisible();
          await adminMR.selectSourceSection('BASICGENERAL');
          await adminMR.selectSourceField('stackabilityFactor');
          await adminMR.selectTargetSection('BASICDIMENSION');
          await adminMR.selectTargetField('weightUnit');
          await adminMR.fillSourceValue('999');
          await adminMR.clickAddRule();
          await adminMR.verifyToast('Business Rule Created');

          logPhase('PHASE 4', 'Verify both rules visible in list');
          await adminMR.searchRule('weightUnit');
          const rows = adminMR.page.locator('[role="row"]').filter({ hasText: 'weightUnit' });
          const count = await rows.count();
          expect(count).toBeGreaterThanOrEqual(2);

          logPhase('CLEANUP', 'Delete both rules');
          await adminMR.safeDeleteRule('weightUnit');
          await adminMR.safeDeleteRule('weightUnit');
        } finally {
          await adminMR.safeDeleteRule('weightUnit');
          await adminMR.safeDeleteRule('weightUnit');
        }
      }
    );
  }
);
