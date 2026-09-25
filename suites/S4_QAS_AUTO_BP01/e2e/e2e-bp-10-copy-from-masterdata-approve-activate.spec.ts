import { test } from '@playwright/test';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { MyInboxPage } from '../../../pages/cr/MyInboxPage';
import { ActivationPage } from '../../../pages/activation/ActivationPage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData } from '../suite.config';
import { createRequestorActions } from '../../../pages/actions/RequestorActions';
import { createApproverActions } from '../../../pages/actions/ApproverActions';
import { createStewardActions } from '../../../pages/actions/StewardActions';

/**
 * E2E-TC10: Copy from onpremise master data → Submit → Approve → Activate
 * Suite: S4_QAS_AUTO_BP01
 *
 * Skills used:
 *   - copy-from-masterdata.md
 *   - approve-cr.md
 *   - steward/activate.md
 *   - verify-data.md
 *
 * Flow:
 *   [Requestor] Login → Click Master Data sidebar → Search BP → Copy → Switch template → Submit
 *   [Requestor] Verify SUBMITTED
 *   [Approver] My Inbox → Approve → verify left inbox
 *   [Steward] Activation → Assign → Activate → verify ACTIVATED
 *
 * Multi-context: 3 browser contexts — session isolation per role
 */

const TD = getTestData('e2e-bp-10');

test.describe(
  'E2E-BP-10: Copy from Master Data → Approve → Activate',
  { tag: ['@cr', '@bp', '@bp:bp-cr-lifecycle'] },
  () => {
    test(
      'Full flow: Copy from onpremise master data → Approve → Steward Activate',
      { tag: ['@workflow', '@happy-path', '@TC-10'] },
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
        const myInbox = new MyInboxPage(approverPage);
        const activation = new ActivationPage(stewardPage);

        const requestor = createRequestorActions(requestorPage);
        const approver = createApproverActions(approverPage);
        const steward = createStewardActions(stewardPage);

        let newCR = '';

        try {
          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 1: REQUESTOR — Copy from Master Data & Submit');
          console.log('══════════════════════════════════════');

          await myRequest.login();

          console.log('[Requestor] Copying from Master Data');
          await requestor.copyFromMasterData(TD.masterDataBP, suiteConfig.templates.AUTO_BP01.name);

          await myRequest.fillHeader({
            description: TD.description,
            priority: TD.priority,
            reason: TD.reason,
            notes: TD.notes,
          });

          const newCR = await requestor.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);

          // Wait for redirect to My Request and verify status
          await requestorPage.waitForTimeout(3000);
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
          await approver.approve(newCR, suiteConfig.comments.approverApprove);
          await myInbox.verifyCRLeft(newCR);

          console.log(`\n✅ PHASE 2 COMPLETE — CR ${newCR} approved`);

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
          await steward.waitForActivated(newCR);
          await steward.verifyStatus(TD.expectedStatuses.activationStatus);

          console.log(
            `\n✅ PHASE 3 COMPLETE — CR ${newCR} → ${TD.expectedStatuses.activationStatus}`
          );

          console.log('\n══════════════════════════════════════');
          console.log('✅ E2E-TC10 PASSED');
          console.log(`   CR: ${newCR}`);
          console.log('   Flow: COPY FROM MASTER DATA → SUBMITTED → APPROVED → ACTIVATED');
          console.log('   Multi-context: ✓ REQUESTOR, ✓ APPROVER, ✓ STEWARD');
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
