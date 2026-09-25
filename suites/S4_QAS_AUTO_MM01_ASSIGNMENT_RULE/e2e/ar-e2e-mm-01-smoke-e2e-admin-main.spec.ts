import { test } from '@playwright/test';
import { AdminAssignmentRulePage } from '../../../pages/admin/AdminAssignmentRulePage';
import { MainAssignmentRuleVerifyPage } from '../../../pages/verify/MainAssignmentRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { MyInboxPage } from '../../../pages/cr/MyInboxPage';
import { ActivationPage } from '../../../pages/activation/ActivationPage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData, generateTimestamp } from '../suite.config';
import { createApproverActions } from '../../../pages/actions/ApproverActions';
import { createStewardActions } from '../../../pages/actions/StewardActions';

const TD = getTestData('ar-e2e-mm-01');

test.describe(
  'AR-E2E-MM-01: Smoke - Admin + Main E2E Happy Path for Assignment Rule',
  { tag: ['@rules', '@assignment-rule', '@mm', '@bp:assignment-rule'] },
  () => {
    test(
      'Admin: Create → Requestor: Copy CR & Verify → Approve → Activate → Admin: Delete',
      { tag: ['@smoke', '@workflow', '@happy-path', '@TC-00'] },
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

        const adminAR = new AdminAssignmentRulePage(adminPage);
        const mainAR = new MainAssignmentRuleVerifyPage(requestorPage);
        const approverMainAR = new MainAssignmentRuleVerifyPage(approverPage);
        const stewardMainAR = new MainAssignmentRuleVerifyPage(stewardPage);
        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);
        const myInbox = new MyInboxPage(approverPage);
        const activation = new ActivationPage(stewardPage);

        const approver = createApproverActions(approverPage);
        const steward = createStewardActions(stewardPage);

        const rules = TD.adminRules;
        let newCR = '';

        try {
          // ═══════════════════════════════════════════════════════════
          //  PHASE 1: ADMIN  -  Create Rules
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 1: ADMIN  -  Create 2 Assignment Rules');
          console.log('======================================');

          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminAR.navigateToAssignmentRule(
            suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name
          );

          for (const rule of rules) {
            await adminAR.createAssignmentRule({
              sourceSection: rule.sourceSection,
              sourceField: rule.sourceField,
              targetSection: rule.targetSection,
              targetField: rule.targetField,
              sourceProperty: rule.sourceProperty,
            });
          }

          console.log(
            '\n-- [OK] PHASE 1 COMPLETE  -  ' + rules.length + ' Assignment Rules created --'
          );

          // ═══════════════════════════════════════════════════════════
          //  PHASE 2: REQUESTOR  -  Copy CR → Fill Header → Verify Rule → Submit
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 2: REQUESTOR  -  Copy CR & Verify Rule');
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

          // Verify assignment rules: Length → Width & Height auto-assign
          await mainAR.verifyRule(TD.mainInputValue, TD.unitOfDimension);

          // Submit
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);

          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterSubmit);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterSubmit);

          console.log(
            `\n[OK] PHASE 2 COMPLETE  -  CR ${newCR} -> ${TD.expectedStatuses.afterSubmit}`
          );

          // ═══════════════════════════════════════════════════════════
          //  PHASE 3: APPROVER  -  Approve CR
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 3: APPROVER  -  Approve CR');
          console.log('======================================');

          await loginAs(
            approverPage,
            suiteConfig.accounts.approver.user,
            suiteConfig.accounts.approver.pass
          );
          await myInbox.goto();
          await myInbox.searchCR(newCR);
          await myInbox.openCRDetail(newCR, 'Product', 'Material Number');

          // Verify rule values are preserved in Approver's edit mode
          await approverMainAR.verifyRuleAtApprover(TD.mainInputValue);

          await approver.approve(newCR, undefined, 'Material Number');
          await myInbox.verifyCRLeft(newCR);

          console.log(`\n[OK] PHASE 3 COMPLETE  -  CR ${newCR} approved`);

          // ── Cross-verify: Requestor verify APPROVED ────────────────
          console.log('\n-- Cross-verify: Requestor verify APPROVED --');
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterApprove);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterApprove);
          console.log(`[OK] Cross-verify: CR ${newCR} -> ${TD.expectedStatuses.afterApprove}`);

          // ═══════════════════════════════════════════════════════════
          //  PHASE 4: STEWARD  -  Activate CR
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 4: STEWARD  -  Activate CR');
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

          // Verify rule values are preserved in Steward's read-only mode (post-activation)
          await activation.clickCRLink(newCR);
          await stewardMainAR.verifyRuleAtSteward(TD.stewardMainInputValue);

          console.log(
            `\n[OK] PHASE 4 COMPLETE  -  CR ${newCR} -> ${TD.expectedStatuses.activationStatus}`
          );

          // ── Cross-verify: Requestor verify APPROVED + ACTIVATED ────
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
          //  PHASE 5: ADMIN  -  Delete Rules (cleanup)
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 5: ADMIN  -  Delete Assignment Rules (Cleanup)');
          console.log('======================================');

          for (const rule of rules) {
            await adminAR.deleteAssignmentRule(rule.sourceSection, rule.targetField);
          }

          console.log('\n-- [OK] PHASE 5 COMPLETE  -  ' + rules.length + ' rules deleted --');

          console.log('\n======================================');
          console.log('[OK] AUTO-01 PASSED');
          for (let i = 0; i < rules.length; i++) {
            console.log(
              '  Rule ' +
                (i + 1) +
                ': ' +
                rules[i].sourceSection +
                '.' +
                rules[i].sourceField +
                ' → ' +
                rules[i].targetSection +
                '.' +
                rules[i].targetField +
                ' (Source Property: ' +
                rules[i].sourceProperty +
                ')'
            );
          }
          console.log('  CR: ' + newCR);
          console.log('  Flow: Copy CR → Fill Header → Verify Rule → Submit → Approve → Activate');
          console.log('======================================');
        } finally {
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
