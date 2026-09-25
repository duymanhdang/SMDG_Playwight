import { test, expect } from '@playwright/test';
import { loginToSimpleMDG, loginAs } from '../../helpers/auth';
import { submitCRWithConfirm, waitForCRStatus, verifyCRStatus } from '../../helpers/workflow';
import { getTestData } from '../../suites/S4_QAS_AUTO_BP01/suite.config';

const TD = getTestData('smoke-bp-05');
import { MyRequestPage } from '../../pages/cr/MyRequestPage';
import { MyInboxPage } from '../../pages/cr/MyInboxPage';
import { ActivationPage } from '../../pages/activation/ActivationPage';
import { createApproverActions } from '../../pages/actions/ApproverActions';
import { createStewardActions } from '../../pages/actions/StewardActions';
import { createRequestorActions } from '../../pages/actions/RequestorActions';

/**
 * TC05 — Full Flow Happy Path
 *
 * Scenario: Submit → Approve → Activate
 *
 * Flow:
 *   [Requestor] Copy CR → Fill form → Submit → verify SUBMITTED
 *   [Approver]  My Inbox → Search CR → Approve → verify No data
 *   [Steward]   Activation → Search CR → verify UNASSIGNED
 *               → Assign to me → verify ASSIGNED
 *               → Approve → verify INPROGRESS → poll → verify ACTIVATED
 *
 * Accounts (từ .env):
 *   Requestor → SAP_USER / SAP_PASS
 *   Approver  → APPROVER_USER / APPROVER_PASS
 *   Steward   → STEWARD_USER / STEWARD_PASS
 */
test.describe('SMOKE-05: Copy Request → Approve → Steward Activate', { tag: ['@bp'] }, () => {
  const SOURCE_CR = 'CR0000015052';

  test.describe('Full flow checks', { tag: ['@bp'] }, () => {
    test(
      '01 - Submit → Approve → Activate',
      { tag: ['@smoke', '@workflow', '@happy-path'] },
      async ({ page }) => {
        let newCR = '';

        await test.step('Phase 1 - Requestor submit CR', async () => {
          console.log('━━━ PHASE 1: REQUESTOR ━━━');

          const myRequest = new MyRequestPage(page);
          const requestor = createRequestorActions(page);

          await loginToSimpleMDG(page);
          await myRequest.goto();

          // Open copy form using Action Class
          await requestor.copyRequest(SOURCE_CR);

          // Fill header using MyRequestPage
          await myRequest.fillHeader({
            description: TD.description,
            priority: 'MEDIUM',
            reason: 'New Business Partner',
            notes: 'CI/CD End-to-End Automation via GitHub Action',
          });

          // Submit và lấy CR number
          console.log('[Test] Submitting CR...');
          newCR = await submitCRWithConfirm(page, 'Requestor has submitted this request !');
          console.log(`✅ Requestor: CR ${newCR} đã Submit`);

          // Verify SUBMITTED
          const searchField = page.getByRoleUI5('SearchField');
          await waitForCRStatus(page, searchField, newCR, 'SUBMITTED');
          await verifyCRStatus(page, newCR, 'SUBMITTED');
          console.log(`✅ PHASE 1 DONE — CR ${newCR} → SUBMITTED`);
        });

        await test.step('Phase 2 - Approver approve CR', async () => {
          console.log('━━━ PHASE 2: APPROVER ━━━');

          const myInbox = new MyInboxPage(page);
          const approver = createApproverActions(page);

          await loginAs(page, process.env.APPROVER_USER || '', process.env.APPROVER_PASS || '');
          await myInbox.goto();
          await approver.search(newCR);
          await approver.openDetail(newCR);
          await approver.approve(newCR);
          await myInbox.verifyCRLeft(newCR);

          console.log(`✅ PHASE 2 COMPLETED — CR ${newCR} → APPROVED`);
        });

        await test.step('Phase 3 - Steward activate CR', async () => {
          console.log('━━━ PHASE 3: STEWARD ━━━');

          const activation = new ActivationPage(page);
          const steward = createStewardActions(page);

          await loginAs(page, process.env.STEWARD_USER || '', process.env.STEWARD_PASS || '');
          await activation.goto();
          await steward.search(newCR);
          await steward.verifyStatus('UNASSIGNED');
          await steward.assign(newCR);
          await steward.verifyStatus('ASSIGNED');
          await steward.approve(newCR);
          await steward.verifyStatus('INPROGRESS');
          await steward.waitForActivated(newCR);
          await steward.verifyStatus('ACTIVATED');
        });

        console.log(`✅ TC05 PASSED — CR ${newCR}: SUBMITTED → APPROVED → ACTIVATED`);
      }
    );
  });
});
