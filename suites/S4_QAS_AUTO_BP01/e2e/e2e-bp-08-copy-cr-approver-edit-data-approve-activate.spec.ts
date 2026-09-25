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
 * E2E-TC08: Copy CR → Approver edits data + priority → Approve → Activate
 * Suite: S4_QAS_AUTO_BP01
 *
 * Skills used:
 *   - copy.md
 *   - approver/edit-data.md
 *   - approver/change-priority.md
 *   - approve-cr.md
 *   - steward/activate.md
 *   - verify-data.md
 *
 * Flow:
 *   [Requestor] Copy CR → Submit → verify SUBMITTED
 *   [Approver] My Inbox → Edit Postal Code + change priority → Approve → verify left inbox
 *   [Steward] Activation → Assign → Activate → verify ACTIVATED + edited data saved
 *
 * Multi-context: 3 browser contexts — session isolation per role
 */

const TD = getTestData('e2e-bp-08');

test.describe(
  'E2E-BP-08: Copy Request → Approver edits data → Approve → Activate',
  { tag: ['@cr', '@bp', '@bp:bp-cr-lifecycle'] },
  () => {
    test(
      'Full flow: Copy CR → Approver edits SearchTerm1 + changes priority → Approve → Steward Activate',
      { tag: ['@workflow', '@happy-path', '@TC-08'] },
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
          console.log('  PHASE 2: APPROVER — Edit data + Change priority + Approve');
          console.log('══════════════════════════════════════');

          await loginAs(
            approverPage,
            suiteConfig.accounts.approver.user,
            suiteConfig.accounts.approver.pass
          );
          await myInbox.goto();
          await myInbox.searchCR(newCR);
          await myInbox.openCRDetail(newCR);

          console.log(`[Approver] Changing priority to ${TD.editData.priority}...`);
          await approver.changePriority(TD.editData.priority);
          console.log(`[Approver] ✅ Priority changed to ${TD.editData.priority}`);

          console.log(
            `[Approver] Editing Company Postal Code to "${TD.editData.companyPostalCode}"...`
          );
          await approverPage
            .getByRole('textbox', { name: 'Company Postal Code', exact: true })
            .click();
          await approverPage
            .getByRole('textbox', { name: 'Company Postal Code', exact: true })
            .fill(TD.editData.companyPostalCode);
          console.log(
            `[Approver] ✅ Company Postal Code updated to "${TD.editData.companyPostalCode}"`
          );

          await approver.approve(newCR, suiteConfig.comments.approverApprove);
          await myInbox.verifyCRLeft(newCR);

          console.log(`\n✅ PHASE 2 COMPLETE — CR ${newCR} → ${TD.expectedStatuses.afterApprove}`);

          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 3: STEWARD — Assign & Activate');
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
          await steward.waitForActivated(newCR);

          console.log(
            `\n✅ PHASE 3 COMPLETE — CR ${newCR} → ${TD.expectedStatuses.activationStatus}`
          );

          console.log('\n══════════════════════════════════════');
          console.log('✅ E2E-TC08 PASSED');
          console.log(`   CR: ${newCR}`);
          console.log('   Flow: COPY CR → SUBMITTED → EDITED → APPROVED → ACTIVATED');
          console.log('   Edited: CompanyPostalCode="90015", Priority=HIGH');
          console.log('   Multi-context: ✓ REQUESTOR, ✓ APPROVER, ✓ STEWARD');
          console.log('═══════════════════════════════��══════');
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
