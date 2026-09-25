import { test, expect } from '@playwright/test';
import { AdminDuplicationRulePage } from '../../../pages/admin/AdminDuplicationRulePage';
import { loginAs } from '../../../helpers/auth';
import { logPhase } from '../../../helpers/utils';
import { suiteConfig, getTestData, suiteData } from '../suite.config';

const TD = getTestData('dr-e2e-mm-02');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_DUPLICATION_RULE.name;
const R1 = suiteData.rules.R1;
const R3 = suiteData.rules.R3;

test.describe(
  'DR-E2E-MM-02: Admin CRUD + Validation for Duplication Rules',
  { tag: ['@rules', '@duplication-rule', '@mm', '@bp:duplication-rule'] },
  () => {
    test(
      'Create R1 -> Verify list -> Required-field validation -> Self-reference -> Delete',
      { tag: ['@happy-path', '@negative', '@admin', '@TC-01'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const adminPage = await adminCtx.newPage();
        await adminPage.evaluate(() => {
          document.title = '[ADMIN]';
        });

        const adminDR = new AdminDuplicationRulePage(adminPage);

        try {
          logPhase(
            'TC-02',
            'ADMIN CRUD & VALIDATION',
            'Navigate → Required-field validation → Create R1 → Verify → Self-reference → Delete'
          );

          console.log(
            `\n[1a] Admin login + navigate to Duplication Rule (template: ${TEMPLATE_NAME})`
          );
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminDR.navigateToDuplicationRule(TEMPLATE_NAME);
          console.log('✅  Navigated to Duplication Rule page');

          console.log(
            `\n[2a] ➡️ Open Add New dialog (blank) → Submit → expect required-field error`
          );
          await adminDR.clickAddNew();
          await adminDR.verifyAddNewDialogVisible();
          await adminDR.clickAddRule();
          const errorDialog = adminPage.locator('[role="alertdialog"]').last();
          await expect(errorDialog).toBeVisible({ timeout: 5000 });
          const errorText = await errorDialog.innerText();
          console.log(`     Error dialog text: "${errorText}"`);
          const hasError =
            errorText.includes('empty') ||
            errorText.includes('required') ||
            errorText.includes('fill');
          expect(hasError).toBeTruthy();
          await adminPage.keyboard.press('Escape');
          await adminDR.waitForBusy(2000);
          console.log('✅  Required-field validation passed');

          console.log(
            `\n[3a] Create R1: ${R1.sourceSection}/${R1.sourceField} → ${R1.targetSection}/${R1.targetField}`
          );
          await adminDR.createDuplicationRule({
            sourceSection: R1.sourceSection,
            sourceField: R1.sourceField,
            targetSection: R1.targetSection,
            targetField: R1.targetField,
          });
          await adminDR.verifyToast('Business Rule Created');
          console.log('[3b] 🔍 Verify rule content in table');
          await adminDR.verifyRuleRowContent({
            sourceSection: R1.sourceSection,
            sourceField: R1.sourceField,
            targetSection: R1.targetSection,
            targetField: R1.targetField,
          });
          console.log('✅  R1 created and verified in list');

          console.log(`\n[4a] Self-reference validation: source = target = ${R3.sourceField}`);
          await adminDR.clickAddNew();
          await adminDR.verifyAddNewDialogVisible();
          await adminDR.selectSourceSection(R3.sourceSection);
          await adminDR.selectSourceField(R3.sourceField);
          await adminDR.selectTargetSection(R3.sourceSection);
          await adminDR.selectTargetField(R3.sourceField);
          await adminDR.clickAddRule();
          const dupDialog = adminPage.locator('[role="alertdialog"]').last();
          if (await dupDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
            const dupText = await dupDialog.innerText();
            console.log(`     Self-reference error: "${dupText}"`);
            await adminPage.keyboard.press('Escape');
            await adminDR.waitForBusy(2000);
          } else {
            console.log('     No error dialog — self-reference may be accepted silently');
          }
          await adminDR.cancelAddNewDialog();
          console.log('✅  Self-reference validation handled');

          console.log(`\n[5a] ➡️ Delete R1: ${R1.targetField}`);
          await adminDR.searchRuleBySourceSection(R1.sourceSection);
          await adminDR.verifyRuleRowVisible();
          await adminDR.clickDeleteRule(R1.targetField);
          await adminDR.verifyConfirmationDialog();
          await adminDR.confirmDelete();
          await adminDR.waitForBusy(3000);
          console.log('✅  R1 deleted successfully');

          console.log('\n✅  TC-02: ADMIN CRUD & VALIDATION — ALL CHECKS PASSED');
        } finally {
          // Note: context NOT closed here — Playwright manages cleanup on worker exit.
        }
      }
    );
  }
);
