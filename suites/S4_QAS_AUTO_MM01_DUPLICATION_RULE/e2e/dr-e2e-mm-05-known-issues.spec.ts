import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetup';
import { createDuplicationRule, safeDeleteDuplicationRule } from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp, suiteData } from '../suite.config';

const TD = getTestData('dr-e2e-mm-05');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_DUPLICATION_RULE.name;
const RULES = TD.rules.map((rid: string) => suiteData.rules[rid]);

test.describe(
  'DR-E2E-MM-05: Additional UI-blocking Rules',
  { tag: ['@rules', '@duplication-rule', '@mm', '@bp:duplication-rule'] },
  () => {
    RULES.forEach((rule: any) => {
      test(
        `${rule.id}: ${rule.sourceSection}/${rule.sourceField} -> ${rule.targetSection}/${rule.targetField} (UI-blocking)`,
        { tag: ['@data-driven', '@negative', '@TC-04'] },
        async ({ browser }) => {
          test.setTimeout(suiteConfig.timeouts.e2eTest);

          const ctx = await setupTestContext(browser);
          const { adminDR, mainDR, myRequest } = ctx;

          const description = `${rule.id}-${rule.sourceSection}.${rule.sourceField}→${rule.targetSection}.${rule.targetField}: UI-blocking [AUTO] ${generateTimestamp()}`;

          try {
            logPhase(
              'PHASE 1',
              'ADMIN — Create Duplication Rule',
              `${rule.id}: "${rule.sourceSection}.${rule.sourceField}" → "${rule.targetSection}.${rule.targetField}"`
            );

            await loginBoth(ctx);
            await createDuplicationRule(adminDR, TEMPLATE_NAME, {
              sourceSection: rule.sourceSection,
              sourceField: rule.sourceField,
              targetSection: rule.targetSection,
              targetField: rule.targetField,
            });

            logPhase(
              'PHASE 2',
              'REQUESTOR — Verify UI-blocking Duplication Check',
              `Flow: Copy CR → Set source=${rule.testValue} → Set target=${rule.testValue} → Submit → Expect Error`
            );

            await openCopyRequestAndFillHeader(
              myRequest,
              suiteConfig.sourceCRs.default,
              description
            );

            // Set source value (Material Type = FERT via F4)
            console.log(`[2c] 🔍 Set source via F4[${rule.sourceF4Index}] = "${rule.testValue}"`);
            if (rule.sourceF4Index !== undefined) {
              await mainDR.clickF4Icon(rule.sourceF4Index);
            } else {
              await mainDR.clickF4ByLabel(rule.sourceLabel);
            }
            await mainDR.selectF4Value(rule.testValue);
            await mainDR.selectExactTextInDialog(rule.testValue);

            // Set target value (Long Text = FERT)
            console.log(
              `[2d] 🔍 Set target "${rule.targetLabel}" = "${rule.testValue}" (same value → trigger duplication)`
            );
            await mainDR.fillTextArea(rule.targetLabel, rule.testValue);

            console.log(`[2e] ➡️ Submitting with duplicate values...`);
            await mainDR.clickSubmitButton();

            console.log(
              `[2f] 🔍 Verifying error dialog (expected: "Please correct all the field(")`
            );
            await mainDR.verifyErrorDialog('Please correct all the field(');
            await mainDR.dismissErrorDialog();

            logPhase('PHASE 3', 'CLEANUP — Delete Duplication Rule');

            console.log(`[3a] Delete rule: ${rule.sourceSection}/${rule.targetField}`);
            await adminDR.deleteDuplicationRule(rule.sourceSection, rule.targetField);

            console.log(
              `\n✅  ${rule.id} UI-BLOCKING — VERIFIED: "${rule.testValue}" → duplication error triggered ✓`
            );
          } finally {
            await safeDeleteDuplicationRule(adminDR, rule.sourceSection, rule.targetField);
          }
        }
      );
    });
  }
);
