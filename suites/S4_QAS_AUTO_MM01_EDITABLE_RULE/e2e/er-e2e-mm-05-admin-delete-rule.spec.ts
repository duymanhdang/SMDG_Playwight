import { test, Browser } from '@playwright/test';
import { AdminEditableRulePage } from '../../../pages/admin/AdminEditableRulePage';
import { loginAs } from '../../../helpers/auth';
import { logPhase } from '../../../helpers/utils';
import { createEditableRuleBySourceField, safeDeleteEditableRule } from '../../../helpers/domain';
import { suiteConfig, getTestData } from '../suite.config';

const TD = getTestData('er-e2e-mm-05');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-05: Admin Delete Editable Rule',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'Create R2 → Delete → Verify empty state',
      { tag: ['@admin', '@happy-path', '@TC-04'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await ctx.newPage();
        const adminER = new AdminEditableRulePage(page);
        const targetField = 'productOldID';

        try {
          await loginAs(page, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);

          logPhase('PHASE 1', 'ADMIN — Create Editable Rule R2');
          await createEditableRuleBySourceField(adminER, TEMPLATE_NAME, {
            sourceSection: 'BASICGENERAL',
            sourceField: 'division',
            targetSection: 'BASICGENERAL',
            targetField,
            sourceValue: '*',
            acceptedAnyValue: true,
          });

          logPhase('PHASE 2', 'ADMIN — Delete rule and verify deletion');
          await adminER.deleteRule(targetField);

          await adminER.searchRule(targetField);
          await adminER.verifyRulePageLoaded();
        } finally {
          await safeDeleteEditableRule(adminER, targetField);
          await ctx.close();
        }
      }
    );
  }
);
