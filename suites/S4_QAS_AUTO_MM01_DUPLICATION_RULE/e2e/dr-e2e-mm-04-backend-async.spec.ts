import { test } from '@playwright/test';
import { verifyFailedWithLog } from '../../../helpers/workflow/failedFlow';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth, TestContext } from '../../../helpers/setup/testSetup';
import { createDuplicationRule, safeDeleteDuplicationRule } from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp, suiteData } from '../suite.config';

const TD = getTestData('dr-e2e-mm-04');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_DUPLICATION_RULE.name;
const RULES = TD.rules.map((rid: string) => suiteData.rules[rid]);

test.describe(
  'DR-E2E-MM-04: Main - Backend-async Duplication Check',
  { tag: ['@rules', '@duplication-rule', '@mm', '@bp:duplication-rule'] },
  () => {
    let ctx: TestContext;
    let adminDR: any;
    let mainDR: any;
    let myRequest: any;
    let form: any;
    let requestorPage: any;

    test.beforeAll(async ({ browser }) => {
      ctx = await setupTestContext(browser);
      adminDR = ctx.adminDR;
      mainDR = ctx.mainDR;
      myRequest = ctx.myRequest;
      form = ctx.form;
      requestorPage = ctx.requestorPage;
      await loginBoth(ctx);
    });

    RULES.forEach((rule: any) => {
      test(
        `${rule.id}: ${rule.sourceSection}/${rule.sourceField} -> ${rule.targetSection}/${rule.targetField} (Backend-async)`,
        { tag: ['@data-driven', '@happy-path', '@TC-03'] },
        async () => {
          const description = `${rule.id}-${rule.sourceSection}.${rule.sourceField}→${rule.targetSection}.${rule.targetField}: Backend-async [AUTO] ${generateTimestamp()}`;
          let newCR = '';

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
              'REQUESTOR — Verify Backend-async Duplication Check',
              `Flow: Copy CR → Set duplicate values → Submit → FAILED → System Log`
            );

            await openCopyRequestAndFillHeader(
              myRequest,
              suiteConfig.sourceCRs.default,
              description
            );

            // === R5: Same-section repeatable with Edit flow (Units of Measure) ===
            if (rule.sameSection && rule.sameDialog) {
              console.log(
                `\n[2c] 🔍 Same-section repeatable — open Edit for "${rule.sourceSectionTitle}"`
              );
              await mainDR.clickEditBySectionTitle(rule.sourceSectionTitle);

              console.log(`[2d] 🔍 Set source "${rule.sourceLabel}" = "${rule.testValue}"`);
              await mainDR.setInputFieldValue(rule.sourceLabel, rule.testValue);

              console.log(
                `[2e] 🔍 Set target "${rule.targetLabel}" = "${rule.testValue}" (duplicate)`
              );
              await mainDR.setInputFieldValue(rule.targetLabel, rule.testValue);

              console.log(`[2f] ➡️ Confirm Edit dialog`);
              await mainDR.clickUpdateDialog();

              // === R4: Cross-section with complex repeatable dialog (Sales Org Data) ===
            } else if (rule.dialogConfig) {
              console.log(`\n[2c] 🔍 Cross-section with repeatable dialog`);

              if (rule.sourceTab) {
                console.log(`[2d] Navigate to source section "${rule.sourceTab}"`);
                await mainDR.navigateToTargetArea(rule.sourceTab);
              }

              console.log(`[2e] 🔍 Set source via F4[${rule.sourceF4Index}] = "${rule.testValue}"`);
              await mainDR.clickF4Icon(rule.sourceF4Index);
              await mainDR.selectF4Value(rule.testValue);
              if (rule.sourceSelectMethod === 'text') {
                await mainDR.selectRowByTextInDialog(rule.testValue);
              } else {
                await mainDR.selectFirstRowInDialog();
              }

              if (rule.targetTab) {
                console.log(`[2f] Navigate to target section "${rule.targetTab}"`);
                await mainDR.navigateToTargetArea(rule.targetTab);
              }

              console.log(
                `[2g] ➡️ Click Add button (index ${rule.targetAddButtonIndex}) to open dialog`
              );
              await mainDR.clickAddButton(rule.targetAddButtonIndex);

              console.log(`[2h] 🔍 Fill repeatable dialog fields`);
              await mainDR.fillRepeatableDialog(rule.dialogConfig);

              console.log(`[2i] ➡️ Confirm dialog`);
              await mainDR.page
                .getByRoleUI5('Button', { text: rule.targetEditConfirm || 'Add' })
                .click();
              await mainDR.waitForBusy(3000);

              // === R3: Standard cross-section with Edit flow (Units of Measure) ===
            } else {
              if (rule.sourceTab) {
                console.log(`[2c] Navigate to source section "${rule.sourceTab}"`);
                await mainDR.navigateToTargetArea(rule.sourceTab);
              }

              console.log(`[2d] 🔍 Set source "${rule.sourceLabel}" = "${rule.testValue}"`);
              if (rule.sourceType === 'F4') {
                if (rule.sourceF4Index !== undefined) {
                  await mainDR.clickF4Icon(rule.sourceF4Index);
                } else {
                  await mainDR.clickF4ByLabel(rule.sourceLabel);
                }
                await mainDR.selectF4Value(rule.testValue);
                await mainDR.selectFirstRowInDialog();
              } else {
                await mainDR.setInputFieldValue(rule.sourceLabel, rule.testValue);
              }

              if (rule.targetTab) {
                console.log(`[2e] Navigate to target section "${rule.targetTab}"`);
                await mainDR.navigateToTargetArea(rule.targetTab);
              }

              if (rule.targetEditFlow) {
                console.log(`[2f] ➡️ Open Edit for "${rule.targetSectionTitle}"`);
                await mainDR.clickEditBySectionTitle(rule.targetSectionTitle);
              }

              console.log(
                `[2g] 🔍 Set target "${rule.targetLabel}" = "${rule.testValue}" (duplicate)`
              );
              if (rule.targetType === 'F4') {
                await mainDR.clickF4ByLabel(rule.targetLabel);
                await mainDR.selectF4Value(rule.testValue);
                await mainDR.selectFirstRowInDialog();
              } else {
                await mainDR.setInputFieldValue(rule.targetLabel, rule.testValue);
              }

              if (rule.targetEditFlow && rule.targetEditConfirm) {
                console.log(`[2h] ➡️ Confirm Edit dialog`);
                await mainDR.clickUpdateDialog();
              }
            }

            // Submit — should be accepted (backend async validation)
            console.log(`\n[3a] ➡️ Submitting CR (expecting backend async validation)...`);
            newCR = await form.submit(suiteConfig.comments.requestorSubmit);
            console.log(`✅ CR ${newCR} submitted — waiting for FAILED status...`);

            // Verify FAILED status + System Log
            const logPattern = rule.systemLogPattern
              ? `[Business rule] Duplication rule: ${rule.systemLogPattern}`
              : `[Business rule] Duplication rule: ${rule.sourceSection} - ${rule.sourceField}| ${rule.targetSection} - ${rule.targetField}`;
            console.log(`[3b] 🔍 Polling CR ${newCR} → FAILED + checking System Log`);
            await verifyFailedWithLog(requestorPage, newCR, logPattern);

            console.log(
              `\n✅  ${rule.id} BACKEND-ASYNC — VERIFIED: duplicate → FAILED → System Log ✓`
            );
          } finally {
            // ── CLEANUP — Cancel CR + Delete rule (always runs) ──
            if (newCR) {
              try {
                console.log(`[Cleanup] Cancel FAILED CR ${newCR}`);
                await myRequest.goto();
                await myRequest.cancelCR(newCR);
              } catch (e: any) {
                console.log(`[Cleanup] Cancel CR error: ${e.message}`);
              }
            }
            await safeDeleteDuplicationRule(adminDR, rule.sourceSection, rule.targetField);
          }
        }
      );
    });
  }
);
