import { test, expect } from '@playwright/test';
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
import { saveDraft, reopenLatestDraft } from '../../../helpers/workflow';

const TD = getTestData('ar-e2e-mm-08');

test.describe(
  'AR-E2E-MM-08: Full Workflow (Requestor → Approver → Steward)',
  { tag: ['@rules', '@assignment-rule', '@mm', '@bp:assignment-rule'] },
  () => {
    let adminCtx: any;
    let requestorCtx: any;
    let approverCtx: any;
    let stewardCtx: any;

    let adminPage: any;
    let requestorPage: any;
    let approverPage: any;
    let stewardPage: any;

    let adminAR: any;
    let mainAR: any;
    let approverMainAR: any;
    let stewardMainAR: any;
    let myRequest: any;
    let form: any;
    let myInbox: any;
    let activation: any;
    let approver: any;
    let steward: any;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(suiteConfig.timeouts.e2eTest);
      adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      approverCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      stewardCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

      adminPage = await adminCtx.newPage();
      requestorPage = await requestorCtx.newPage();
      approverPage = await approverCtx.newPage();
      stewardPage = await stewardCtx.newPage();

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

      adminAR = new AdminAssignmentRulePage(adminPage);
      mainAR = new MainAssignmentRuleVerifyPage(requestorPage);
      approverMainAR = new MainAssignmentRuleVerifyPage(approverPage);
      stewardMainAR = new MainAssignmentRuleVerifyPage(stewardPage);
      myRequest = new MyRequestPage(requestorPage);
      form = new CopyRequestForm(requestorPage);
      myInbox = new MyInboxPage(approverPage);
      activation = new ActivationPage(stewardPage);
      approver = createApproverActions(approverPage);
      steward = createStewardActions(stewardPage);

      // Login all roles
      await loginAs(adminPage, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
      await loginAs(
        requestorPage,
        suiteConfig.accounts.requestor.user,
        suiteConfig.accounts.requestor.pass
      );
      await loginAs(
        approverPage,
        suiteConfig.accounts.approver.user,
        suiteConfig.accounts.approver.pass
      );
      await loginAs(
        stewardPage,
        suiteConfig.accounts.steward.user,
        suiteConfig.accounts.steward.pass
      );

      // Navigate requestor to My Request
      await myRequest.goto();

      // Create rule
      console.log('\n======================================');
      console.log('  beforeAll: ADMIN Create Rules');
      console.log('======================================');
      await adminAR.navigateToAssignmentRule(suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name);
      for (const r of TD.adminRules) {
        await adminAR.createAssignmentRule({
          sourceSection: r.sourceSection,
          sourceField: r.sourceField,
          targetSection: r.targetSection,
          targetField: r.targetField,
        });
      }
      console.log('[OK] ' + TD.adminRules.length + ' rules created');
    });

    test.afterAll(async () => {
      console.log('\n======================================');
      console.log('  afterAll: ADMIN Delete Rules');
      console.log('======================================');
      for (const r of TD.adminRules) {
        try {
          await adminAR.deleteAssignmentRule(r.sourceSection, r.targetField);
          console.log(
            '[OK] Rule deleted: ' + r.sourceSection + '.' + r.sourceField + ' -> ' + r.targetField
          );
        } catch (e) {
          console.log('[WARN] Delete failed for ' + r.sourceSection + '.' + r.targetField + ':', e);
        }
      }
      await adminCtx.close();
      await requestorCtx.close();
      await approverCtx.close();
      await stewardCtx.close();
      console.log('[Cleanup] Contexts closed');
    });

    // ═══════════════════════════════════════════════════════════
    //  PATH_HAPPY: Copy → Draft → Re-fill → Submit → Approve → Activate
    // ═══════════════════════════════════════════════════════════
    test(
      'PATH_HAPPY: Copy → Draft → Re-fill → Submit → Approve → Activate',
      { tag: ['@workflow', '@happy-path', '@TC-19'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        let newCR = '';

        try {
          // ── PHASE 1: REQUESTOR ── Copy CR → Fill Header → Draft → Re-fill → Verify → Submit
          console.log('\n======================================');
          console.log('  PATH_HAPPY - PHASE 1: REQUESTOR');
          console.log('======================================');

          await myRequest.goto();
          await myRequest.openCopyRequest(TD.sourceCR, TD.confirmLabel);

          await myRequest.fillHeader({
            description: `${TD.header.description} HAPPY ${generateTimestamp()}`,
            priority: TD.header.priority,
            reason: TD.header.reason,
            notes: TD.header.notes,
          });

          // Verify rule on fresh dialog (auto-assignment fires immediately)
          await mainAR.verifyRule(TD.mainInputValue, TD.unitOfDimension);

          // Save Draft → Reopen → verify values persisted
          await saveDraft(requestorPage);
          await reopenLatestDraft(requestorPage);

          await mainAR.verifyRuleAtApprover(TD.mainInputValue);

          // Submit
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);
          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');
          console.log(`[OK] Requestor: CR ${newCR} -> SUBMITTED`);

          // ── PHASE 2: APPROVER ── Verify rule → Approve
          console.log('\n======================================');
          console.log('  PATH_HAPPY - PHASE 2: APPROVER');
          console.log('======================================');

          await myInbox.goto();
          await myInbox.searchCR(newCR);
          await myInbox.openCRDetail(newCR, 'Product', TD.confirmLabel);

          await approverMainAR.verifyRuleAtApprover(TD.mainInputValue);

          await approver.approve(newCR, undefined, 'Material Number');
          await myInbox.verifyCRLeft(newCR);
          console.log(`[OK] Approver: CR ${newCR} approved`);

          // Cross-verify: Requestor verify APPROVED
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, 'APPROVED');
          await myRequest.verifyStatus(newCR, 'APPROVED');
          console.log(`[OK] Cross-verify: CR ${newCR} -> APPROVED`);

          // ── PHASE 3: STEWARD ── Assign → Approve → Wait ACTIVATED → Verify
          console.log('\n======================================');
          console.log('  PATH_HAPPY - PHASE 3: STEWARD');
          console.log('======================================');

          await activation.goto();
          await steward.search(newCR);
          await steward.verifyStatus('UNASSIGNED');
          await steward.assign(newCR);
          await steward.verifyStatus('ASSIGNED');
          await steward.approve(newCR);
          await steward.verifyStatus('INPROGRESS');
          await steward.waitForActivated(newCR);
          await steward.verifyStatus('ACTIVATED');

          // Verify rule value at Steward (read-only, post-activation)
          await activation.clickCRLink(newCR);
          await stewardMainAR.verifyRuleAtSteward(TD.stewardMainInputValue);

          // Cross-verify: Requestor verify ACTIVATED
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, 'ACTIVATED');
          await myRequest.verifyStatus(newCR, 'ACTIVATED');
          console.log(`[OK] Cross-verify: CR ${newCR} -> ACTIVATED`);

          console.log('\n✅ [PATH_HAPPY] PASSED');
        } finally {
          // CR is either SUBMITTED, APPROVED, ACTIVATED, or CANCELLED — no cleanup needed
        }
      }
    );

    // ═══════════════════════════════════════════════════════════
    //  PATH_REJECT: Copy → Submit → Reject (END)
    // ═══════════════════════════════════════════════════════════
    test(
      'PATH_REJECT: Copy → Submit → Reject',
      { tag: ['@workflow', '@negative', '@TC-20'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        let newCR = '';

        try {
          // ── PHASE 1: REQUESTOR ── Copy CR → Fill Header → Verify → Submit
          console.log('\n======================================');
          console.log('  PATH_REJECT - PHASE 1: REQUESTOR');
          console.log('======================================');

          await myRequest.goto();
          await myRequest.openCopyRequest(TD.sourceCR, TD.confirmLabel);

          await myRequest.fillHeader({
            description: `${TD.header.description} REJECT ${generateTimestamp()}`,
            priority: TD.header.priority,
            reason: TD.header.reason,
            notes: TD.header.notes,
          });

          await mainAR.verifyRule(TD.mainInputValue, TD.unitOfDimension);

          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);
          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');
          console.log(`[OK] Requestor: CR ${newCR} -> SUBMITTED`);

          // ── PHASE 2: APPROVER ── Verify rule → Reject
          console.log('\n======================================');
          console.log('  PATH_REJECT - PHASE 2: APPROVER REJECT');
          console.log('======================================');

          await myInbox.goto();
          await myInbox.searchCR(newCR);
          await myInbox.openCRDetail(newCR, 'Product', TD.confirmLabel);

          await approverMainAR.verifyRuleAtApprover(TD.mainInputValue);

          await approver.reject(newCR, suiteConfig.comments.approverReject);
          console.log(`[OK] Approver: CR ${newCR} -> REJECTED`);

          console.log('\n[OK] PATH_REJECT COMPLETED');
        } catch (e) {
          throw e;
        }
      }
    );

    // ═══════════════════════════════════════════════════════════
    //  PATH_CANCEL: Copy → Submit → Cancel
    // ═══════════════════════════════════════════════════════════
    test(
      'PATH_CANCEL: Copy → Submit → Cancel',
      { tag: ['@workflow', '@negative', '@TC-21'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        let newCR = '';

        try {
          // ── PHASE 1: REQUESTOR ── Copy CR → Fill Header → Verify → Submit
          console.log('\n======================================');
          console.log('  PATH_CANCEL - PHASE 1: REQUESTOR');
          console.log('======================================');

          await myRequest.goto();
          await myRequest.openCopyRequest(TD.sourceCR, TD.confirmLabel);

          await myRequest.fillHeader({
            description: `${TD.header.description} CANCEL ${generateTimestamp()}`,
            priority: TD.header.priority,
            reason: TD.header.reason,
            notes: TD.header.notes,
          });

          // Verify assignment rule
          await mainAR.verifyRule(TD.mainInputValue, TD.unitOfDimension);

          // Submit
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);
          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');
          console.log(`[OK] Requestor: CR ${newCR} -> SUBMITTED`);

          // ── PHASE 2: REQUESTOR ── Cancel → Verify read-only
          console.log('\n======================================');
          console.log('  PATH_CANCEL - PHASE 2: REQUESTOR CANCEL');
          console.log('======================================');

          await myRequest.goto();
          await myRequest.cancelCR(newCR);
          await myRequest.waitForStatus(newCR, 'CANCELLED');
          await myRequest.verifyStatus(newCR, 'CANCELLED');
          console.log(`[OK] Requestor: CR ${newCR} -> CANCELLED`);

          await myRequest.openCRDetail(newCR, TD.confirmLabel);
          await mainAR.verifyRuleAtSteward(TD.mainInputValue);
          console.log('\n✅ [PATH_CANCEL] PASSED');
        } catch (e) {
          throw e;
        }
      }
    );
  }
);
