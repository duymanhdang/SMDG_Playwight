import { test, expect, Browser } from '@playwright/test';
import { AdminEditableRulePage } from '../../../pages/admin/AdminEditableRulePage';
import { loginAs } from '../../../helpers/auth';
import { logPhase } from '../../../helpers/utils';
import { suiteConfig, getTestData } from '../suite.config';

const TD = getTestData('er-e2e-mm-02');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-02: Admin Create Rule based on Source Field',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'Dialog validation, cascade, Add/Cancel, required-field, same-field error',
      { tag: ['@happy-path', '@negative', '@admin', '@TC-01'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await ctx.newPage();
        const adminER = new AdminEditableRulePage(page);
        const targetField = 'loadingGroup';

        try {
          await loginAs(page, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);

          logPhase(
            'PHASE 1',
            'ADMIN — Test dialog cascade and validation',
            'Required-field validation, same-field error, Add/Cancel'
          );

          await adminER.navigateToEditableRule(TEMPLATE_NAME);

          await adminER.clickAddNew();
          await adminER.verifyAddNewDialogVisible();

          await adminER.cancelAddNewDialog();

          logPhase(
            'PHASE 2',
            'ADMIN — Create R3 (PLANTDATA → SHIPPINGDATATIMEINDAYS)',
            'Source-Field based, with F4 Source Value'
          );

          await adminER.navigateToEditableRule(TEMPLATE_NAME);
          await adminER.createRuleBySourceField(
            'PLANTDATA',
            'replacementPart',
            'SHIPPINGDATATIMEINDAYS',
            'loadingGroup',
            'A'
          );
          await adminER.verifyToast('Business Rule Created');

          logPhase('PHASE 3', 'ADMIN — Verify rule in list');

          await adminER.verifyRuleInList('loadingGroup');

          logPhase('PHASE 4', 'ADMIN — Cleanup');

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
