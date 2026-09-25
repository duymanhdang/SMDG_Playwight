import { test } from '@playwright/test';
import { verifyFailedWithLog } from '../../../helpers/workflow/failedFlow';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetup';
import { createDuplicationRule, safeDeleteDuplicationRule } from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp, suiteData } from '../suite.config';

const TD = getTestData('dr-e2e-mm-06');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_DUPLICATION_RULE.name;
const R3 = suiteData.rules.R3;

test.describe(
  'DR-E2E-MM-06: Workflow - Duplication Rule (Copy CR)',
  { tag: ['@rules', '@duplication-rule', '@mm', '@bp:duplication-rule'] },
  () => {
    test(
      'Copy template with duplication rule -> Verify backend async -> Failed + System Log',
      { tag: ['@workflow', '@negative', '@TC-05'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await setupTestContext(browser);
        const { adminDR, mainDR, myRequest, form, requestorPage } = ctx;

        const description = `R3-BASICGENERAL.baseUnit→UNITSOFMEASURE.alternativeUnit: Workflow copy/edit [AUTO] ${generateTimestamp()}`;
        let newCR = '';

        try {
          logPhase(
            'PHASE 1',
            'ADMIN — Create Duplication Rule R3 (Backend-async)',
            `R3: "${R3.sourceSection}.${R3.sourceField}" → "${R3.targetSection}.${R3.targetField}"`
          );

          await loginBoth(ctx);
          await createDuplicationRule(adminDR, TEMPLATE_NAME, {
            sourceSection: R3.sourceSection,
            sourceField: R3.sourceField,
            targetSection: R3.targetSection,
            targetField: R3.targetField,
          });

          logPhase(
            'PHASE 2',
            'REQUESTOR — Verify Backend-async Duplication Check',
            `Flow: Copy CR → Set source=${R3.testValue} → Submit → FAILED → System Log`
          );

          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);

          console.log(`[2c] Navigate to section "Basic Data"`);
          await mainDR.navigateToTargetArea('Basic Data');

          console.log(
            `[2d] 🔍 Set source "${R3.sourceLabel}" = "${R3.testValue}" (via F4[${R3.sourceF4Index}])`
          );
          await mainDR.clickF4Icon(R3.sourceF4Index);
          await mainDR.selectF4Value(R3.testValue);
          await mainDR.selectFirstRowInDialog();

          console.log(`[2e] ➡️ Open Edit for "${R3.targetSectionTitle}"`);
          await mainDR.clickEditBySectionTitle('Units of Measure');

          console.log(`[2f] 🔍 Set target "${R3.targetLabel}" = "${R3.testValue}" (duplicate)`);
          await mainDR.clickF4ByLabel(R3.targetLabel);
          await mainDR.selectF4Value(R3.testValue);
          await mainDR.selectFirstRowInDialog();

          console.log(`[2g] ➡️ Confirm Edit dialog`);
          await mainDR.clickUpdateDialog();

          console.log(`\n[3a] ➡️ Submitting CR (expecting backend async validation)...`);
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`✅ CR ${newCR} submitted — waiting for FAILED status...`);

          console.log(`[3b] 🔍 Polling CR → FAILED + checking System Log`);
          await myRequest.goto();
          const expectedLog =
            '[Business rule] Duplication rule: BASICGENERAL - baseUnit| UNITSOFMEASURE - alternativeUnit';
          await verifyFailedWithLog(requestorPage, newCR, expectedLog);

          logPhase('PHASE 4', 'CLEANUP — Cancel CR + Delete Duplication Rule');

          console.log(`[4b] Cancel FAILED CR ${newCR}`);
          await myRequest.goto();
          await myRequest.cancelCR(newCR);
          console.log(`[4c] Delete rule: ${R3.sourceSection}/${R3.targetField}`);
          await adminDR.deleteDuplicationRule(R3.sourceSection, R3.targetField);

          console.log(
            `\n✅  TC-06 WORKFLOW — VERIFIED: Backend-async duplication → FAILED → System Log → Cancelled ✓`
          );
        } finally {
          await safeDeleteDuplicationRule(adminDR, R3.sourceSection, R3.targetField);
        }
      }
    );
  }
);
