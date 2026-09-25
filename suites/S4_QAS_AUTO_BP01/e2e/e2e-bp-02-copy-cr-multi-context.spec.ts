import { test, expect } from '@playwright/test';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { MyInboxPage } from '../../../pages/cr/MyInboxPage';
import { ActivationPage } from '../../../pages/activation/ActivationPage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData } from '../suite.config';
import { ApproverActions, createApproverActions } from '../../../pages/actions/ApproverActions';
import { StewardActions, createStewardActions } from '../../../pages/actions/StewardActions';

/**
 * E2E-TC02: Copy CR Full Flow — Multi-Context
 * Suite: S4_QAS_AUTO_BP01
 *
 * Skills used:
 *   - approve-cr.md
 *   - activate-cr.md
 *   - verify-status.md
 *
 * Flow:
 *   [Requestor] Copy CR → Fill header → Submit → verify SUBMITTED
 *   [Approver]  My Inbox → Approve → verify left inbox
 *   [Requestor] My Request → verify APPROVED          ← cross-verify
 *   [Steward]   Activation → Assign → Approve → verify ACTIVATED
 *   [Requestor] My Request → verify APPROVED + ACTIVATED ← cross-verify
 *
 * Multi-context: 3 browser contexts — session isolation per role
 * Difference from E2E-TC01: Uses Copy Request instead of New Request
 */

const TD = getTestData('e2e-bp-02');

test.describe(
  'E2E-BP-02: Copy Request → Approve → Activate',
  { tag: ['@cr', '@bp', '@bp:bp-cr-lifecycle'] },
  () => {
    test(
      'Full flow: Copy CR request lifecycle with cross-role verify',
      { tag: ['@workflow', '@happy-path', '@TC-02'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        // ── Setup: 3 contexts độc lập ─────────────────────────────────────────
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const approverCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const stewardCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

        const requestorPage = await requestorCtx.newPage();
        const approverPage = await approverCtx.newPage();
        const stewardPage = await stewardCtx.newPage();

        // Label pages for easy identification
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR] SimpleMDG';
        });
        await approverPage.evaluate(() => {
          document.title = '[APPROVER] SimpleMDG';
        });
        await stewardPage.evaluate(() => {
          document.title = '[STEWARD] SimpleMDG';
        });

        // Page Objects - for navigation
        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);
        const myInbox = new MyInboxPage(approverPage);
        const activation = new ActivationPage(stewardPage);

        // Action Classes - for actions
        const approver = createApproverActions(approverPage);
        const steward = createStewardActions(stewardPage);

        let newCR = '';

        try {
          // ════════════════════════════════════════════════════════════════════
          // PHASE 1: REQUESTOR — Copy CR and Submit
          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 1: REQUESTOR — Copy CR & Submit');
          console.log('══════════════════════════════════════');

          await myRequest.login();
          await myRequest.goto();
          await myRequest.openCopyRequest(suiteConfig.sourceCRs.default);

          // Fill header using MyRequestPage
          await myRequest.fillHeader({
            description: TD.description,
            priority: TD.priority,
            notes: TD.notes,
          });
          await form.selectTemplate(suiteConfig.templates.AUTO_BP01.key, TD.templateName);

          // Submit
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);

          // Verify SUBMITTED
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterSubmit);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterSubmit);

          console.log(`\n✅ PHASE 1 COMPLETE — CR ${newCR} → ${TD.expectedStatuses.afterSubmit}`);

          // ════════════════════════════════════════════════════════════════════
          // PHASE 2: APPROVER — Approve CR
          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 2: APPROVER — Approve CR');
          console.log('══════════════════════════════════════');

          await loginAs(
            approverPage,
            suiteConfig.accounts.approver.user,
            suiteConfig.accounts.approver.pass
          );
          await myInbox.goto();
          await myInbox.searchCR(newCR);
          await myInbox.openCRDetail(newCR);
          await approver.approve(newCR);
          await myInbox.verifyCRLeft(newCR);

          console.log(`\n✅ PHASE 2 COMPLETE — CR ${newCR} approved`);

          // ── Cross-verify: Requestor verify APPROVED ────────────────────────
          console.log('\n── Cross-verify: Requestor verify APPROVED ──');
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterApprove);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterApprove);
          console.log(`✅ Cross-verify: CR ${newCR} → ${TD.expectedStatuses.afterApprove}`);

          // ════════════════════════════════════════════════════════════════════
          // PHASE 3: STEWARD — Activate CR
          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 3: STEWARD — Activate CR');
          console.log('══════════════════════════════════════');

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

          console.log(
            `\n✅ PHASE 3 COMPLETE — CR ${newCR} → ${TD.expectedStatuses.activationStatus}`
          );

          // ── Cross-verify: Requestor verify APPROVED + ACTIVATED ───────────
          console.log('\n── Cross-verify: Requestor verify APPROVED + ACTIVATED ──');
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterApprove);
          await myRequest.verifyBothStatuses(
            newCR,
            TD.expectedStatuses.afterApprove,
            TD.expectedStatuses.activationStatus
          );
          console.log(`✅ Cross-verify: CR ${newCR} → APPROVED + ACTIVATED`);

          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════════');
          console.log(`✅ E2E-TC02 PASSED`);
          console.log(`   CR: ${newCR}`);
          console.log(`   Flow: COPY CR → SUBMITTED → APPROVED → ACTIVATED`);
          console.log(`   Cross-role verify: ✓ APPROVED, ✓ ACTIVATED`);
          console.log('══════════════════════════════════════');
        } finally {
          console.log('\n[Cleanup] Closing all contexts...');
          await requestorCtx.close();
          await approverCtx.close();
          await stewardCtx.close();
          console.log('[Cleanup] ✅ All contexts closed');
        }
      }
    );
  }
);
