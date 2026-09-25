import { test, expect } from '@playwright/test';
import { AdminEditableRulePage } from '../../../pages/admin/AdminEditableRulePage';
import { loginAs } from '../../../helpers/auth';
import { logPhase } from '../../../helpers/utils';
import { suiteConfig, getTestData } from '../suite.config';

const TD = getTestData('er-e2e-mm-03');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-03: Admin XOR Validation — One-Way (UA→Source)',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'User Attribute selection hides Source Section/Field; Source Section selection does NOT hide User Attribute',
      { tag: ['@admin', '@happy-path', '@TC-02'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await ctx.newPage();
        const adminER = new AdminEditableRulePage(page);

        await loginAs(page, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
        await adminER.navigateToEditableRule(TEMPLATE_NAME);

        logPhase('PHASE 1', 'Verify both fields visible on fresh dialog');
        await adminER.clickAddNew();
        await adminER.verifyAddNewDialogVisible();

        expect(await adminER.isUserAttributeVisible()).toBe(true);
        expect(await adminER.isSourceSectionVisible()).toBe(true);

        logPhase('PHASE 2', 'Select User Attribute → Source Section hidden');
        await adminER.selectUserAttribute('User ID');
        await adminER.verifySourceSectionHidden();

        await adminER.cancelAddNewDialog();

        logPhase('PHASE 3', 'Select Source Section → User Attribute remains visible (XOR one-way)');
        await adminER.clickAddNew();
        await adminER.verifyAddNewDialogVisible();
        await adminER.selectSourceSection('BASICGENERAL');
        expect(await adminER.isUserAttributeVisible()).toBe(true);

        await adminER.cancelAddNewDialog();

        await ctx.close();
      }
    );
  }
);
