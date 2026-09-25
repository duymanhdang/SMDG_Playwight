import { test, expect } from '@playwright/test';
import { AdminEditableRulePage } from '../../../pages/admin/AdminEditableRulePage';
import { loginAs } from '../../../helpers/auth';
import { logPhase } from '../../../helpers/utils';
import { suiteConfig, getTestData } from '../suite.config';

const TD = getTestData('er-e2e-mm-14');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-14: Main Checkbox Target Field',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'Create rule targeting checkbox; verify UI handling (known broken across all rule types)',
      { tag: ['@negative', '@admin', '@TC-13'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await ctx.newPage();
        const adminER = new AdminEditableRulePage(page);
        const targetField = 'crossPlantStatus';

        try {
          await loginAs(page, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
          await adminER.navigateToEditableRule(TEMPLATE_NAME);

          logPhase(
            'PHASE 1',
            'ADMIN — Attempt to create rule with checkbox target',
            'Note: Bug-check-05 — checkbox target known broken across ALL rule types (BA-confirmed)'
          );

          await adminER.clickAddNew();
          await adminER.verifyAddNewDialogVisible();

          await adminER.selectSourceSection('BASICGENERAL');
          await adminER.selectSourceField('division');
          await adminER.selectTargetSection('PLANTDATA');
          await adminER.selectTargetField(targetField);
          await adminER.fillSourceValue('1');
          await adminER.clickAddRule();

          const hasError = await page
            .locator('[role="alertdialog"]')
            .isVisible({ timeout: 2000 })
            .catch(() => false);

          if (hasError) {
            logPhase(
              'PHASE 2',
              'Error dialog appeared as expected (known issue Bug-check-05)',
              'Checkbox target field handling is broken — capture and dismiss'
            );
            const errorText = await page
              .locator('[role="alertdialog"]')
              .textContent()
              .catch(() => '');
            expect(errorText?.length ?? 0).toBeGreaterThan(0);
            await adminER.dismissErrorDialog();
          } else {
            logPhase('PHASE 2', 'Rule created successfully, verify in list');
            await adminER.verifyRuleInList(targetField);
            await adminER.deleteRule(targetField);
          }
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
