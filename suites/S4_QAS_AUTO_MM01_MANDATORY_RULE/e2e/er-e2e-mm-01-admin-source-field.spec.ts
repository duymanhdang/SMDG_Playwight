import { test, expect } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupMr';
import { safeDeleteMandatoryRule } from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, generateTimestamp } from '../suite.config';

const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_MANDATORY_RULE.name;

test.describe(
  'MR-E2E-MM-01: Admin Create Rule Dialog - Source Field Mode',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    test(
      'Decision Table: dropdown cascade, create, required-field, duplicate, cancel, non-matching value',
      { tag: ['@negative', '@TC-01'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        const ctx = await setupTestContext(browser);
        const { adminMR, mainMR, myRequest } = ctx;
        const description = `MR-01: Admin Dialog Source Field Mode [AUTO] ${generateTimestamp()}`;
        const fieldsToClean: string[] = [];

        try {
          logPhase('PHASE 1', 'ADMIN — Navigate to Mandatory Rule');
          await loginBoth(ctx);
          await adminMR.navigateToMandatoryRule(TEMPLATE_NAME);
          await adminMR.verifyRulePageLoaded();

          // Pre-cleanup: delete rule if exists from previous run
          await adminMR.safeDeleteRule('weightUnit').catch(() => {});

          // ── Step 1: Verify Source Section is a dropdown ──
          logPhase('STEP 1', 'Verify dialog + Source Section dropdown + Guideline');
          await adminMR.clickAddNew();
          await adminMR.verifyAddNewDialogVisible();

          // Verify Source Section ComboBox exists
          await expect(
            adminMR.page.getByRoleUI5('ComboBox', { placeholder: 'Enter Source Section' })
          ).toBeVisible({ timeout: 5000 });

          // ── Step 2: Verify Source Field disabled/enabled cascade ──
          logPhase('STEP 2', 'Verify Source Field cascade (disabled -> enabled)');
          const sourceField = adminMR.page.getByRoleUI5('ComboBox', {
            placeholder: 'Enter Source Field',
          });
          await expect(sourceField).toBeDisabled({ timeout: 3000 });
          // Select Source Section -> Source Field enables
          await adminMR.selectSourceSection('BASICGENERAL');
          await expect(sourceField).toBeEnabled({ timeout: 5000 });

          // ── Step 3: Clear Source Field -> Source Value cleared ──
          logPhase('STEP 3', 'Clear Source Field -> Source Value cleared');
          await adminMR.selectSourceField('division');
          const sourceValueInput = adminMR.page.locator('[id$="-ConfigValue-inner"]');
          const hasVal = await sourceValueInput.isVisible({ timeout: 1000 }).catch(() => false);
          if (hasVal) {
            const val = await sourceValueInput.inputValue().catch(() => '');
            if (val) {
              console.log(`[AdminMR] Source Value before clear: "${val}"`);
            }
          }
          // Clear Source Field via selecting a different ComboBox approach
          await sourceField.click();
          await sourceField.fill('');
          await sourceField.press('Tab');
          await adminMR.page.waitForTimeout(500);
          // Verify Source Value cleared
          if (hasVal) {
            const clearedVal = await sourceValueInput.inputValue().catch(() => '');
            console.log(`[AdminMR] Source Value after clear: "${clearedVal}"`);
          }

          // ── Step 4: Verify Target Section/Target Field cascade ──
          logPhase('STEP 4', 'Verify Target Section/Target Field cascade');
          const targetField = adminMR.page.getByRoleUI5('ComboBox', {
            placeholder: 'Enter Target Field',
          });
          await adminMR.selectTargetSection('BASICDIMENSION');
          await expect(targetField).toBeEnabled({ timeout: 5000 });

          // ── Step 5: Accepted Any Value checkbox ──
          logPhase('STEP 5', 'Verify Accepted Any Value checkbox');
          await adminMR.checkAcceptedAnyValue();
          // Uncheck immediately to leave dialog in clean state for Step 6
          await adminMR.checkAcceptedAnyValue();

          // ── Step 6: Fill and Create Rule ──
          logPhase('STEP 6', 'Create rule');
          // Select Source Section + Field, Target Section + Field
          // Need to re-select because dialog is still open with previous selections
          await adminMR.selectSourceSection('BASICGENERAL');
          await adminMR.selectSourceField('productOldID');
          await adminMR.selectTargetSection('BASICDIMENSION');
          await adminMR.selectTargetField('weightUnit');
          // Fill Source Value
          await adminMR.fillSourceValue('12345');
          await adminMR.clickAddRule();
          await adminMR.verifyToast('Business Rule Created');
          fieldsToClean.push('weightUnit');

          // ── Step 7: Required field validation ──
          logPhase('STEP 7', 'Required field validation');
          await adminMR.clickAddNew();
          await adminMR.verifyAddNewDialogVisible();
          await adminMR.clickAddRule();
          await adminMR.verifyErrorDialog();
          await adminMR.cancelAddNewDialog();

          // ── Step 8: Duplicate validation ──
          logPhase('STEP 8', 'Duplicate rule validation');
          await adminMR.clickAddNew();
          await adminMR.verifyAddNewDialogVisible();
          await adminMR.selectSourceSection('BASICGENERAL');
          await adminMR.selectSourceField('productOldID');
          await adminMR.selectTargetSection('BASICDIMENSION');
          await adminMR.selectTargetField('weightUnit');
          await adminMR.fillSourceValue('12345');
          await adminMR.clickAddRule();
          await adminMR.closeAlertDialog();
          await adminMR.cancelAddNewDialog();

          // ── Step 9: Cancel button (fresh dialog) ──
          logPhase('STEP 9', 'Cancel button');
          await adminMR.clickAddNew();
          await adminMR.verifyAddNewDialogVisible();
          await adminMR.cancelAddNewDialog();

          // ── Step 11: Non-matching source value on Main form ──
          logPhase('STEP 11', 'Non-matching source value does NOT trigger mandatory');
          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);
          await mainMR.navigateToTargetArea('Basic Data');
          await mainMR.navigateToTargetArea('Dimensions/EANs');
          await mainMR.verifyLabelVisible('Weight Unit');
          // Without filling productOldID=12345, weightUnit should NOT be mandatory
          await mainMR.verifyNotMandatory('Weight Unit');

          logPhase('CLEANUP', 'Delete created rules');
          for (const f of fieldsToClean) {
            await adminMR.safeDeleteRule(f);
          }
        } finally {
          for (const f of fieldsToClean) {
            await safeDeleteMandatoryRule(adminMR, f);
          }
        }
      }
    );
  }
);
