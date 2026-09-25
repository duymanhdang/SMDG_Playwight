import { test } from '@playwright/test';
import { AdminEditableRulePage } from '../../../pages/admin/AdminEditableRulePage';
import { loginAs } from '../../../helpers/auth';
import { logPhase } from '../../../helpers/utils';
import { suiteConfig, getTestData } from '../suite.config';

const TD = getTestData('er-e2e-mm-04');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-04: Admin Create Rule based on User Attribute',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'Create R1: userID → UNITSOFMEASURE/alternativeUnit with source value',
      { tag: ['@admin', '@TC-03'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await ctx.newPage();
        const adminER = new AdminEditableRulePage(page);
        const targetField = 'alternativeUnit';

        try {
          await loginAs(page, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);

          logPhase(
            'PHASE 1',
            'ADMIN — Create Editable Rule R1 (User Attribute)',
            'R1: userID → UNITSOFMEASURE/alternativeUnit = smdg.prestage@proton.me'
          );

          await adminER.navigateToEditableRule(TEMPLATE_NAME);
          await adminER.clickAddNew();
          await adminER.verifyAddNewDialogVisible();
          await adminER.selectUserAttribute('User ID');
          await adminER.selectTargetSection('UNITSOFMEASURE');
          for (let i = 0; i < 20; i++) {
            const tf = page.getByRoleUI5('ComboBox', { placeholder: 'Enter Target Field' });
            if (await tf.isEnabled().catch(() => false)) break;
            await page.waitForTimeout(500);
          }
          await adminER.selectTargetField(targetField);
          await adminER.fillSourceValue('smdg.prestage@proton.me');
          await adminER.clickAddRule();
          await adminER.verifyToast('Business Rule Created');

          logPhase('PHASE 2', 'ADMIN — Verify rule in list');
          await adminER.verifyRuleInList(targetField);

          logPhase('PHASE 3', 'ADMIN — Cleanup');
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
