import { test, expect } from '@playwright/test';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { MyInboxPage } from '../../../pages/cr/MyInboxPage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData } from '../suite.config';
import { ApproverActions, createApproverActions } from '../../../pages/actions/ApproverActions';

/**
 * E2E-TC03: Reject Path — Multi-Context
 * Suite: S4_QAS_AUTO_BP01
 *
 * Skills used:
 *   - approve-cr.md (for reject functionality)
 *   - verify-status.md
 *
 * Flow:
 *   [Requestor] Copy CR → Fill header → Submit → verify SUBMITTED
 *   [Approver]  My Inbox → Reject CR with comment → verify left inbox
 *   [Requestor] My Request → verify REJECTED          ← cross-verify
 *
 * Multi-context: 2 browser contexts — session isolation per role
 */

const TD = getTestData('e2e-bp-03');

test.describe(
  'E2E-BP-03: Copy Request → Approver Reject',
  { tag: ['@cr', '@bp', '@bp:bp-cr-lifecycle'] },
  () => {
    test(
      'Full flow: Copy CR request lifecycle with reject path and cross-role verify',
      { tag: ['@workflow', '@negative', '@TC-03'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        // ── Setup: 2 contexts độc lập ─────────────────────────────────────────
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const approverCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

        const requestorPage = await requestorCtx.newPage();
        const approverPage = await approverCtx.newPage();

        // Label pages for easy identification
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR] SimpleMDG';
        });
        await approverPage.evaluate(() => {
          document.title = '[APPROVER] SimpleMDG';
        });

        // Page Objects - for navigation
        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);
        const myInbox = new MyInboxPage(approverPage);

        // Action Classes - for actions
        const approver = createApproverActions(approverPage);

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
          // PHASE 2: APPROVER — Reject CR
          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 2: APPROVER — Reject CR');
          console.log('══════════════════════════════════════');

          await loginAs(
            approverPage,
            suiteConfig.accounts.approver.user,
            suiteConfig.accounts.approver.pass
          );
          await myInbox.goto();
          await myInbox.searchCR(newCR);
          await myInbox.openCRDetail(newCR);
          await approver.reject(newCR, suiteConfig.comments.approverReject);
          await myInbox.verifyCRLeft(newCR);

          console.log(`\n✅ PHASE 2 COMPLETE — CR ${newCR} rejected`);

          // ── Cross-verify: Requestor verify REJECTED ────────────────────────
          console.log('\n── Cross-verify: Requestor verify REJECTED ──');
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterReject);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterReject);
          console.log(`✅ Cross-verify: CR ${newCR} → ${TD.expectedStatuses.afterReject}`);

          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════════');
          console.log(`✅ E2E-TC03 PASSED`);
          console.log(`   CR: ${newCR}`);
          console.log(`   Flow: COPY CR → SUBMITTED → REJECTED`);
          console.log(`   Cross-role verify: ✓ REJECTED`);
          console.log('══════════════════════════════════════');
        } finally {
          console.log('\n[Cleanup] Closing all contexts...');
          await requestorCtx.close();
          await approverCtx.close();
          console.log('[Cleanup] ✅ All contexts closed');
        }
      }
    );
  }
);
