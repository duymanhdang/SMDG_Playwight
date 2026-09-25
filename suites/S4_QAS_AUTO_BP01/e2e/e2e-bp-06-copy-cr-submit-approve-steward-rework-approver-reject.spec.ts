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
 * E2E-TC06: Copy CR → Approve → Steward Rework to Approver → Approver Reject
 * Suite: S4_QAS_AUTO_BP01
 *
 * Skills used:
 *   - copy.md
 *   - approve-cr.md
 *   - steward/rework-to-approver.md
 *   - approver/reject.md
 *   - verify-status.md
 *
 * Flow:
 *   [Requestor] Copy CR → Fill header → Submit → verify SUBMITTED
 *   [Approver]  My Inbox → Approve → verify left inbox
 *   [Requestor] My Request → verify APPROVED          ← cross-verify
 *   [Steward]   Activation → Assign → Rework to Approver → verify REWORK
 *   [Approver]  My Inbox → Reject CR → verify left inbox
 *   [Requestor] My Request → verify APPROVED + REJECTED ← cross-verify
 *
 * Multi-context: 3 browser contexts — session isolation per role
 */

const TD = getTestData('e2e-bp-06');

test.describe(
  'E2E-BP-06: Copy Request → Approve → Steward Rework → Approver Reject',
  { tag: ['@cr', '@bp', '@bp:bp-cr-lifecycle'] },
  () => {
    test(
      'Full flow: Copy CR → Approve → Steward Rework to Approver → Approver Reject',
      { tag: ['@workflow', '@negative', '@TC-06'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const approverCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const stewardCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

        const requestorPage = await requestorCtx.newPage();
        const approverPage = await approverCtx.newPage();
        const stewardPage = await stewardCtx.newPage();

        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR] SimpleMDG';
        });
        await approverPage.evaluate(() => {
          document.title = '[APPROVER] SimpleMDG';
        });
        await stewardPage.evaluate(() => {
          document.title = '[STEWARD] SimpleMDG';
        });

        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);
        const myInbox = new MyInboxPage(approverPage);
        const activation = new ActivationPage(stewardPage);

        const approver = createApproverActions(approverPage);
        const steward = createStewardActions(stewardPage);

        let newCR = '';

        try {
          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 1: REQUESTOR — Copy CR & Submit');
          console.log('══════════════════════════════════════');

          await myRequest.login();
          await myRequest.goto();
          await myRequest.openCopyRequest(suiteConfig.sourceCRs.default);

          await myRequest.fillHeader({
            description: TD.description,
            priority: TD.priority,
            notes: TD.notes,
          });
          await form.selectTemplate(suiteConfig.templates.AUTO_BP01.key, TD.templateName);

          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);

          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterSubmit);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterSubmit);

          console.log(`\n✅ PHASE 1 COMPLETE — CR ${newCR} → ${TD.expectedStatuses.afterSubmit}`);

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

          console.log('\n── Cross-verify: Requestor verify APPROVED ──');
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterApprove);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterApprove);
          console.log(`✅ Cross-verify: CR ${newCR} → ${TD.expectedStatuses.afterApprove}`);

          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 3: STEWARD — Assign & Rework to Approver');
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
          await steward.reworkToApprover(newCR, suiteConfig.comments.stewardReworkToApprover);
          await steward.verifyStatus('REWORK');

          console.log(`\n✅ PHASE 3 COMPLETE — CR ${newCR} → ${TD.expectedStatuses.afterRework}`);

          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 4: APPROVER — Reject CR');
          console.log('══════════════════════════════════════');

          await myInbox.goto();
          await myInbox.searchCR(newCR);
          await myInbox.openCRDetail(newCR);
          await approver.reject(newCR, suiteConfig.comments.approverReject);
          await myInbox.verifyCRLeft(newCR);

          console.log('\n✅ PHASE 4 — CR ' + newCR + ' rejected');

          console.log(
            '\n── Cross-verify: Requestor verify REJECTED + REWORK (Activation Status) ──'
          );
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterReject);
          await myRequest.verifyBothStatuses(
            newCR,
            TD.expectedStatuses.afterReject,
            TD.expectedStatuses.afterRework
          );
          console.log('✅ Cross-verify: CR ' + newCR + ' → REJECTED + REWORK (Activation Status)');

          console.log('\n══════════════════════════════════════');
          console.log('✅ E2E-TC06 PASSED');
          console.log('   CR: ' + newCR);
          console.log('   Flow: COPY CR → SUBMITTED → APPROVED → REWORK → REJECTED');
          console.log('   Cross-role verify: ✓ REJECTED, ✓ REWORK (Activation Status)');
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
