import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth, TestContext } from '../../../helpers/setup/testSetup';
import { createDuplicationRule, safeDeleteDuplicationRule } from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp, suiteData } from '../suite.config';

const TD = getTestData('dr-e2e-mm-03');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_DUPLICATION_RULE.name;
const RULES = TD.rules.map((rid: string) => suiteData.rules[rid]);

test.describe(
  'DR-E2E-MM-03: Main - UI-blocking Duplication Check (same-section)',
  { tag: ['@rules', '@duplication-rule', '@mm', '@bp:duplication-rule'] },
  () => {
    let ctx: TestContext;
    let adminDR: any;
    let mainDR: any;
    let myRequest: any;

    test.beforeAll(async ({ browser }) => {
      ctx = await setupTestContext(browser);
      adminDR = ctx.adminDR;
      mainDR = ctx.mainDR;
      myRequest = ctx.myRequest;
      await loginBoth(ctx);
    });

    RULES.forEach((rule: any) => {
      test(
        `${rule.id}: ${rule.sourceSection}/${rule.sourceField} -> ${rule.targetSection}/${rule.targetField} (UI-blocking)`,
        { tag: ['@data-driven', '@happy-path', '@TC-02'] },
        async () => {
          const description = `${rule.id}-${rule.sourceSection}.${rule.sourceField}→${rule.targetSection}.${rule.targetField}: UI-blocking [AUTO] ${generateTimestamp()}`;

          try {
            logPhase(
              'PHASE 1',
              'ADMIN — Create Duplication Rule',
              `${rule.id}: "${rule.sourceSection}.${rule.sourceField}" → "${rule.targetSection}.${rule.targetField}"`
            );

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

            const targetArea = rule.sourceTab || rule.sourceSectionTitle;
            if (targetArea) {
              console.log(`[2c] Navigate to section "${targetArea}"`);
              await mainDR.navigateToTargetArea(targetArea);
            } else {
              console.log(`[2c] No section specified — using current section`);
            }

            console.log(`[2d] 🔍 Set source "${rule.sourceLabel}" = "${rule.testValue}"`);
            if (rule.sourceType === 'LONGTEXT') {
              await mainDR.fillTextArea(rule.sourceLabel, rule.testValue);
            } else {
              await mainDR.setInputFieldValue(rule.sourceLabel, rule.testValue);
            }

            console.log(
              `[2e] 🔍 Set target "${rule.targetLabel}" = "${rule.testValue}" (same value → trigger duplication)`
            );
            if (rule.targetType === 'DROPDOWN') {
              if (rule.targetF4Index !== undefined) {
                await mainDR.clickF4Icon(rule.targetF4Index);
              } else {
                await mainDR.clickF4ByLabel(rule.targetLabel);
              }
              await mainDR.selectF4Value(rule.testValue);
              await mainDR.selectFirstRowInDialog();
            } else if (rule.targetType === 'LONGTEXT') {
              await mainDR.fillTextArea(rule.targetLabel, rule.testValue);
            } else {
              await mainDR.setInputFieldValue(rule.targetLabel, rule.testValue);
            }

            console.log(`[2f] ➡️ Submitting with duplicate values...`);
            await mainDR.clickSubmitButton();
            console.log(`[2g] 🔍 Verifying error dialog`);
            await mainDR.verifyErrorDialog('Please correct all the field(');
            await mainDR.dismissErrorDialog();

            console.log(
              `\n✅  ${rule.id} UI-BLOCKING — VERIFIED: "${rule.sourceLabel}=${rule.testValue}" → duplication error triggered ✓`
            );
          } finally {
            await safeDeleteDuplicationRule(adminDR, rule.sourceSection, rule.targetField);
          }
        }
      );
    });

    test.afterAll(async () => {
      await safeDeleteDuplicationRule(adminDR, 'BASICTEXT', 'language');
    });
  }
);
