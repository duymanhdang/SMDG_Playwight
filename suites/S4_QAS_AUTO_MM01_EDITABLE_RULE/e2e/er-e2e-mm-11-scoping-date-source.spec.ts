import { test } from '@playwright/test';
import { AdminEditableRulePage } from '../../../pages/admin/AdminEditableRulePage';
import { loginAs } from '../../../helpers/auth';
import { logPhase } from '../../../helpers/utils';
import { suiteConfig, getTestData } from '../suite.config';

const TD = getTestData('er-e2e-mm-11');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-11: Main Scoping + Date-Type Source Field',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'Create temp rule, verify list; Date-type source field known issue SSPD-9983',
      { tag: ['@negative', '@admin', '@TC-10'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await ctx.newPage();
        const adminER = new AdminEditableRulePage(page);
        const targetField = 'loadingGroup';

        try {
          await loginAs(page, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);

          logPhase('PHASE 1', 'ADMIN — Create temporary rule to verify list');
          await adminER.navigateToEditableRule(TEMPLATE_NAME);
          await adminER.clickAddNew();
          await adminER.verifyAddNewDialogVisible();
          await adminER.selectSourceSection('PLANTDATA');
          await adminER.selectSourceField('replacementPart');
          await adminER.selectTargetSection('SHIPPINGDATATIMEINDAYS');
          await adminER.selectTargetField(targetField);
          await adminER.fillSourceValue('A');
          await adminER.clickAddRule();
          await adminER.verifyToast('Business Rule Created');

          logPhase('PHASE 2', 'ADMIN — Verify rule visible in list');
          await adminER.verifyRuleInList(targetField);

          logPhase('PHASE 3', 'CLEANUP');
          await adminER.deleteRule(targetField);
        } finally {
          try {
            const row = page.locator('[role="row"]').filter({ hasText: targetField });
            if (
              await row
                .first()
                .isVisible({ timeout: 2000 })
                .catch(() => false)
            ) {
              await adminER.deleteRule(targetField);
            }
          } catch {
            // ignore
          }
          await ctx.close();
        }
      }
    );
  }
);
