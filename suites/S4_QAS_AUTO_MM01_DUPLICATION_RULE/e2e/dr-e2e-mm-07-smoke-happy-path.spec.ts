import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetup';
import { createDuplicationRule, safeDeleteDuplicationRule } from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('dr-e2e-mm-07');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_DUPLICATION_RULE.name;

test.describe(
  'DR-E2E-MM-07: E2E Smoke - Duplication Rule Happy Path',
  { tag: ['@rules', '@duplication-rule', '@mm', '@bp:duplication-rule'] },
  () => {
    test(
      'Admin: Create R1 -> Requestor: Copy CR -> Duplicate check -> Submit -> Cancel -> Cleanup',
      { tag: ['@smoke', '@workflow', '@happy-path', '@TC-06'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await setupTestContext(browser);
        const { adminDR, mainDR, myRequest, form } = ctx;

        const description = `${TD.description} [AUTO] ${generateTimestamp()}`;
        const testValue = '1.000';
        let newCR = '';

        try {
          logPhase(
            'PHASE 1',
            'ADMIN — Create Duplication Rule R1',
            'R1: BASICDIMENSION.netWeight → BASICDIMENSION.grossWeight (UI-blocking)'
          );

          await loginBoth(ctx);
          await createDuplicationRule(adminDR, TEMPLATE_NAME, {
            sourceSection: 'BASICDIMENSION',
            sourceField: 'netWeight',
            targetSection: 'BASICDIMENSION',
            targetField: 'grossWeight',
          });

          logPhase(
            'PHASE 2',
            'REQUESTOR — E2E Smoke Test',
            'Flow: Copy CR → Set duplicate → Verify error → Fix → Submit → Cancel'
          );

          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);

          console.log(`[2c] Navigate to "Basic Data" tab`);
          await mainDR.navigateToTargetArea('Basic Data');

          console.log(`[2d] 🔍 Set source "Net Weight" = "${testValue}"`);
          await mainDR.setInputFieldValue('Net Weight', testValue);

          console.log(`[2d1] 🔍 Set Weight Unit = "KG" (via F4)`);
          await mainDR.clickF4ByLabel('Weight Unit');
          await mainDR.selectF4Value('KG');
          await mainDR.selectFirstRowInDialog();

          console.log(
            `[2e] 🔍 Set target "Gross Weight" = "${testValue}" (same → trigger duplication)`
          );
          await mainDR.setInputFieldValue('Gross Weight', testValue);

          console.log(`[2f] ➡️ Submit with duplicate values...`);
          await mainDR.clickSubmitButton();

          console.log(`[2g] 🔍 Verify error dialog`);
          await mainDR.verifyErrorDialog('Please correct all the field(');
          await mainDR.dismissErrorDialog();

          console.log(`\n[3a] Fix Gross Weight → "2.000" (different value)`);
          await mainDR.setInputFieldValue('Gross Weight', '2.000');

          console.log(`[3b] ➡️ Submit with corrected values...`);
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`✅ CR submitted: ${newCR}`);

          console.log(`[3c] 🔍 Verify status = SUBMITTED`);
          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');

          console.log(`[3d] Cancel CR ${newCR}`);
          await myRequest.cancelCR(newCR);

          logPhase('PHASE 3', 'CLEANUP — Delete Duplication Rule');

          console.log(`Delete rule: BASICDIMENSION/grossWeight`);
          await adminDR.deleteDuplicationRule('BASICDIMENSION', 'grossWeight');

          console.log(`\n✅  TC-07 E2E SMOKE — ALL CHECKS PASSED ✓`);
        } finally {
          await safeDeleteDuplicationRule(adminDR, 'BASICDIMENSION', 'grossWeight');
        }
      }
    );
  }
);
