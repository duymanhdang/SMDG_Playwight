import { test, expect } from '@playwright/test';
import { AdminVisibleRulePage } from '../../../pages/admin/AdminVisibleRulePage';
import { MainVisibleRuleVerifyPage } from '../../../pages/verify/MainVisibleRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { MyInboxPage } from '../../../pages/cr/MyInboxPage';
import { ActivationPage } from '../../../pages/activation/ActivationPage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, suiteData, getTestData, generateTimestamp } from '../suite.config';
import { createApproverActions } from '../../../pages/actions/ApproverActions';
import { createStewardActions } from '../../../pages/actions/StewardActions';

const TD = getTestData('vr-e2e-mm-08') as any;

test.describe(
  'VR-E2E-MM-08: Smoke — Complete Happy Path for Visible Rule',
  { tag: ['@rules', '@visible-rule', '@mm', '@bp:visible-rule'] },
  () => {
    test(
      'Admin: Create Rule → Requestor: Copy CR & Verify → Approve → Activate → Admin: Delete',
      { tag: ['@smoke', '@workflow', '@happy-path', '@TC-07'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const approverCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const stewardCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

        const adminPage = await adminCtx.newPage();
        const requestorPage = await requestorCtx.newPage();
        const approverPage = await approverCtx.newPage();
        const stewardPage = await stewardCtx.newPage();

        await adminPage.evaluate(() => {
          document.title = '[ADMIN] SimpleMDG';
        });
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR] SimpleMDG';
        });
        await approverPage.evaluate(() => {
          document.title = '[APPROVER] SimpleMDG';
        });
        await stewardPage.evaluate(() => {
          document.title = '[STEWARD] SimpleMDG';
        });

        const adminVR = new AdminVisibleRulePage(adminPage);
        const mainVR = new MainVisibleRuleVerifyPage(requestorPage);
        const approverVR = new MainVisibleRuleVerifyPage(approverPage);
        const stewardVR = new MainVisibleRuleVerifyPage(stewardPage);
        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);
        const myInbox = new MyInboxPage(approverPage);
        const activation = new ActivationPage(stewardPage);

        const approver = createApproverActions(approverPage);
        const steward = createStewardActions(stewardPage);

        const rules = TD.adminRules.map((id: string) => {
          const ref = (suiteData.rules as Record<string, any>)[id];
          return { ...ref, _id: id };
        });
        let newCR = '';

        try {
          // ═══════════════════════════════════════════════════════════
          //  PHASE 1: ADMIN — Create Visible Rule
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 1: ADMIN — Create Visible Rule');
          console.log('======================================');

          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminVR.navigateToVisibleRule(suiteConfig.templates.AUTO_MM01_VISIBLE_RULE.name);

          for (const rule of rules) {
            await adminVR.createVisibleRule({
              sourceSection: rule.sourceSection,
              sourceField: rule.sourceField,
              targetSection: rule.targetSection,
              targetField: rule.targetField,
              sourceValue: rule.sourceValue,
            });
          }

          console.log(`\n-- [OK] PHASE 1 COMPLETE — ${rules.length} Visible Rule(s) created --`);

          // ═══════════════════════════════════════════════════════════
          //  PHASE 2: REQUESTOR — Copy CR → Fill Header → Verify → Submit
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 2: REQUESTOR — Copy CR & Verify Visible Rule');
          console.log('======================================');

          await myRequest.login();
          await myRequest.goto();
          await myRequest.openCopyRequest(TD.sourceCR, 'Material Number');

          await myRequest.fillHeader({
            description: `${TD.header.description} ${generateTimestamp()}`,
            priority: TD.header.priority,
            reason: TD.header.reason,
            notes: TD.header.notes,
          });

          // Navigate to Dimensions/EANs section
          await mainVR.navigateToTargetArea(TD.sourceField.tab);

          // Verify source heading visible
          await mainVR.verifyHeading(TD.sourceField.heading);

          // Verify source field label visible
          await mainVR.verifyFieldLabel(TD.sourceField.label);

          // Boundary: target should be HIDDEN when source value is not yet set
          await mainVR.verifyLabelHidden(TD.targetField.label);

          // Trigger: fill source field with the rule's trigger value
          await mainVR.setInputByLabel(TD.sourceField.label, TD.sourceField.inputValue);

          // Verify: target field label becomes VISIBLE
          await mainVR.verifyFieldLabel(TD.targetField.label);

          // Submit
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);

          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterSubmit);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterSubmit);

          console.log(
            `\n[OK] PHASE 2 COMPLETE — CR ${newCR} -> ${TD.expectedStatuses.afterSubmit}`
          );

          // ═══════════════════════════════════════════════════════════
          //  PHASE 3: APPROVER — Approve CR
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 3: APPROVER — Approve CR');
          console.log('======================================');

          await loginAs(
            approverPage,
            suiteConfig.accounts.approver.user,
            suiteConfig.accounts.approver.pass
          );
          await myInbox.goto();
          await myInbox.searchCR(newCR);
          await myInbox.openCRDetail(newCR, 'Product', 'Material Number');

          // Verify target field is visible in Approver's view
          await approverVR.verifyFieldLabel(TD.targetField.label);

          await approver.approve(newCR, undefined, 'Material Number');
          await myInbox.verifyCRLeft(newCR);

          console.log(`\n[OK] PHASE 3 COMPLETE — CR ${newCR} approved`);

          // Cross-verify: Requestor verify APPROVED
          console.log('\n-- Cross-verify: Requestor verify APPROVED --');
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterApprove);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterApprove);
          console.log(`[OK] Cross-verify: CR ${newCR} -> ${TD.expectedStatuses.afterApprove}`);

          // ═══════════════════════════════════════════════════════════
          //  PHASE 4: STEWARD — Activate CR
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 4: STEWARD — Activate CR');
          console.log('======================================');

          await loginAs(
            stewardPage,
            suiteConfig.accounts.steward.user,
            suiteConfig.accounts.steward.pass
          );
          await activation.goto();
          await steward.search(newCR);
          await steward.verifyStatus('UNASSIGNED');
          await steward.assign(newCR);
          await steward.verifyStatus('ASSIGNED');
          await steward.approve(newCR);
          await steward.verifyStatus('INPROGRESS');
          await steward.waitForActivated(newCR);
          await steward.verifyStatus(TD.expectedStatuses.activationStatus);

          // Note: Steward verify of target field skipped — activation resets Gross Weight, hiding Net Weight

          console.log(
            `\n[OK] PHASE 4 COMPLETE — CR ${newCR} -> ${TD.expectedStatuses.activationStatus}`
          );

          // Cross-verify: Requestor verify APPROVED + ACTIVATED
          console.log('\n-- Cross-verify: Requestor verify APPROVED + ACTIVATED --');
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterApprove);
          await myRequest.verifyBothStatuses(
            newCR,
            TD.expectedStatuses.afterApprove,
            TD.expectedStatuses.activationStatus
          );
          console.log(
            `[OK] Cross-verify: CR ${newCR} -> ${TD.expectedStatuses.afterApprove} + ${TD.expectedStatuses.activationStatus}`
          );

          // ═══════════════════════════════════════════════════════════
          //  PHASE 5: ADMIN — Delete Rule (cleanup)
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 5: ADMIN — Delete Visible Rule (Cleanup)');
          console.log('======================================');

          for (const rule of rules) {
            await adminVR.deleteVisibleRule(rule.sourceSection, rule.targetField);
          }

          console.log(`\n-- [OK] PHASE 5 COMPLETE — ${rules.length} rule(s) deleted --`);

          console.log('\n======================================');
          console.log('[OK] VR-E2E-MM-08 PASSED');
          for (let i = 0; i < rules.length; i++) {
            console.log(
              `  Rule ${i + 1}: ${rules[i].sourceSection}.${rules[i].sourceField} → ${rules[i].targetSection}.${rules[i].targetField} (Source Value: ${rules[i].sourceValue})`
            );
          }
          console.log(`  CR: ${newCR}`);
          console.log(
            `  Flow: Copy CR → Fill Header → Navigate Dims → Fill GrossWeight=10 → Verify NetWeight → Submit → Approve → Activate`
          );
          console.log('======================================');
        } finally {
          // Always safe-delete in finally — handles retry where rule may or may not exist
          for (const rule of rules) {
            await adminVR.safeDeleteVisibleRule(rule.sourceSection, rule.targetField);
          }
          console.log('\n[Cleanup] Closing contexts...');
          await adminCtx.close();
          await requestorCtx.close();
          await approverCtx.close();
          await stewardCtx.close();
          console.log('[Cleanup] [OK] Contexts closed');
        }
      }
    );
  }
);
