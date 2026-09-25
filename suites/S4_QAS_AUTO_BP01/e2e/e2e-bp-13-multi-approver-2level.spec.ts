import { test, expect } from '@playwright/test';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { MyInboxPage } from '../../../pages/cr/MyInboxPage';
import { ActivationPage } from '../../../pages/activation/ActivationPage';
import { AdminPage } from '../../../pages/admin/AdminPage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData } from '../suite.config';
import { createAdminActions } from '../../../pages/actions/AdminActions';
import { resetAdminConfigBestEffort } from '../../../helpers/config/resetConfig';
import { createApproverActions } from '../../../pages/actions/ApproverActions';
import { createStewardActions } from '../../../pages/actions/StewardActions';

/**
 * 🧪 E2E-TC13: Multi-level approver (2 levels) - Full flow
 * Suite: S4_QAS_AUTO_BP01
 *
 * 📚 Skills used:
 *   - admin/config-multiapprover.md (configure approver sequences)
 *   - copy.md (copy CR & submit)
 *   - approve-cr.md (approver actions)
 *   - steward/activate.md (steward activation)
 *   - admin/reset-config.md (reset config)
 *
 * 🔄 Flow:
 *   🔧 [Admin] Configure 1 approver: AUTOBP01B (seq 20) → Save
 *   📝 [Requestor] Copy CR → Submit → verify SUBMITTED
 *   ✅ [Approver1] My Inbox → Approve → verify left inbox
 *   ✅ [Approver2] My Inbox → Approve → verify APPROVED
 *   🚀 [Steward] Activation → Assign → Activate → verify ACTIVATED
 *   🔧 [Admin] Reset config → delete row seq 20 → Save
 *
 * 🌐 Multi-context: 5 browser contexts (admin, requestor, approver1, approver2, steward)
 */

const TD = getTestData('e2e-bp-13');

const RESET_CONFIG = { templateName: 'AUTO_BP01', approverKey: 'AUTOBP01B' };

test.describe(
  'E2E-BP-13: Multi-level Approver (2 levels)',
  { tag: ['@cr', '@bp', '@bp:bp-cr-lifecycle'] },
  () => {
    test(
      'Full flow: Config → Submit → 2 Approvals → Activate',
      { tag: ['@workflow', '@happy-path', '@TC-13'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        // ── Setup: 5 independent browser contexts ──────────────────────────────
        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const approver1Ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const approver2Ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const stewardCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

        const adminPage = await adminCtx.newPage();
        const requestorPage = await requestorCtx.newPage();
        const approver1Page = await approver1Ctx.newPage();
        const approver2Page = await approver2Ctx.newPage();
        const stewardPage = await stewardCtx.newPage();

        // Label pages for identification
        await adminPage.evaluate(() => {
          document.title = '[ADMIN] SimpleMDG';
        });
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR] SimpleMDG';
        });
        await approver1Page.evaluate(() => {
          document.title = '[APPROVER1] SimpleMDG';
        });
        await approver2Page.evaluate(() => {
          document.title = '[APPROVER2] SimpleMDG';
        });
        await stewardPage.evaluate(() => {
          document.title = '[STEWARD] SimpleMDG';
        });

        // Page Objects
        const admin = new AdminPage(adminPage);
        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);
        const myInbox1 = new MyInboxPage(approver1Page);
        const myInbox2 = new MyInboxPage(approver2Page);
        const activation = new ActivationPage(stewardPage);

        // Action Classes
        const adminActions = createAdminActions(adminPage);
        const approver1 = createApproverActions(approver1Page);
        const approver2 = createApproverActions(approver2Page);
        const steward = createStewardActions(stewardPage);

        let newCR = '';

        await admin.loginAs(suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
        await resetAdminConfigBestEffort(
          adminPage,
          admin,
          adminActions,
          RESET_CONFIG,
          'defensive reset'
        );

        try {
          // ════════════════════════════════════════════════════════════════════
          // 🔧 PHASE 1: ADMIN — Configure Approver
          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════');
          console.log('  🔧 PHASE 1: ADMIN — Configure Approver');
          console.log('══════════════════════════════════');

          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          console.log('[Admin] ✅ Logged in successfully');

          await admin.gotoProcessDesigner();
          await admin.searchTemplate('AUTO_BP01');
          await admin.openTemplate('AUTO_BP01');

          // Configure single approver: AUTOBP01B (seq 20)
          // Approver 2 (smdg.s4.qas@proton.me) is separate login for Phase 4
          await adminActions.configureMultiApprover(['AUTOBP01B']);

          console.log('\n✅ PHASE 1 COMPLETE — Single approver configured');
          console.log('   📌 Approver: AUTOBP01B (seq 20)');
          console.log('   📌 Approver 2 login: smdg.s4.qas@proton.me (Phase 4)');

          // ════════════════════════════════════════════════════════════════════
          // 📝 PHASE 2: REQUESTOR — Copy CR & Submit
          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════');
          console.log('  📝 PHASE 2: REQUESTOR — Copy CR & Submit');
          console.log('══════════════════════════════════');

          await myRequest.login();
          await myRequest.goto();
          await myRequest.openCopyRequest(suiteConfig.sourceCRs.default);

          await myRequest.fillHeader({
            description: TD.description,
            priority: TD.priority,
            reason: TD.reason,
            notes: TD.notes,
          });
          //await form.selectTemplate(suiteConfig.templates.AUTO_BP01.key, TD.templateName);

          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] ✅ CR created: ${newCR}`);

          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterSubmit);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterSubmit);

          console.log(`\n✅ PHASE 2 COMPLETE — CR ${newCR} → ${TD.expectedStatuses.afterSubmit}`);

          // ════════════════════════════════════════════════════════════════════
          // ✅ PHASE 3: APPROVER 1 — Approve CR
          // ════════════════════════════════════════════════════════════════════
          console.log('\n════════════════════════════════');
          console.log('  ✅ PHASE 3: APPROVER 1 — Approve CR');
          console.log('════════════════════════════════');

          await loginAs(
            approver1Page,
            suiteConfig.accounts.approver.user,
            suiteConfig.accounts.approver.pass
          );
          await myInbox1.goto();
          await myInbox1.searchCR(newCR);
          // Click on CR link in table (like TC04 - more reliable)
          console.log(`[Approver] Clicking CR link in table: ${newCR}`);
          await myInbox1.page.getByRoleUI5('Link', { text: newCR }).first().click();
          await myInbox1.page.waitForTimeout(5000);
          await approver1.approve(newCR, suiteConfig.comments.approverApprove);
          await myInbox1.verifyCRLeft(newCR);

          console.log(`\n✅ PHASE 3 COMPLETE — CR ${newCR} approved by Approver 1`);
          console.log(`   Status remains: ${TD.expectedStatuses.afterApprover1}`);

          // ════════════════════════════════════════════════════════════════════
          // ✅ PHASE 4: APPROVER 2 — Approve CR
          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════');
          console.log('  ✅ PHASE 4: APPROVER 2 — Approve CR');
          console.log('══════════════════════════════════');

          await loginAs(
            approver2Page,
            suiteConfig.accounts.approver2.user,
            suiteConfig.accounts.approver2.pass
          );
          await myInbox2.goto();
          await myInbox2.searchCR(newCR);
          await myInbox2.openCRDetail(newCR);
          await approver2.approve(newCR, suiteConfig.comments.approverApprove);
          await myInbox2.verifyCRLeft(newCR);

          console.log(`\n✅ PHASE 4 COMPLETE — CR ${newCR} approved by Approver 2`);
          console.log(`   Status: ${TD.expectedStatuses.afterApprover2}`);

          // ── Cross-verify: Requestor verify APPROVED ──────────────────────
          console.log('\n── 🔍 Cross-verify: Requestor verify APPROVED ──');
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterApprover2);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterApprover2);
          console.log(`✅ Cross-verify: CR ${newCR} → ${TD.expectedStatuses.afterApprover2}`);

          // ════════════════════════════════════════════════════════════════════
          // 🚀 PHASE 5: STEWARD — Activate CR
          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════');
          console.log('  🚀 PHASE 5: STEWARD — Activate CR');
          console.log('══════════════════════════════════');

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
            `\n✅ PHASE 5 COMPLETE — CR ${newCR} → ${TD.expectedStatuses.activationStatus}`
          );

          // ── Cross-verify: Requestor verify ACTIVATED ─────────────────────
          console.log('\n── 🔍 Cross-verify: Requestor verify APPROVED + ACTIVATED ──');
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterApprover2);
          await myRequest.verifyBothStatuses(
            newCR,
            TD.expectedStatuses.afterApprover2,
            TD.expectedStatuses.activationStatus
          );
          console.log(`✅ Cross-verify: CR ${newCR} → APPROVED + ACTIVATED`);

          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════');
          console.log(`✅ E2E-TC13 PASSED`);
          console.log(`   CR: ${newCR}`);
          console.log(`   Flow: CONFIG → SUBMIT → APPROVER1 → APPROVER2 → ACTIVATED`);
          console.log(
            `   Multi-context: ✓ ADMIN, ✓ REQUESTOR, ✓ APPROVER1, ✓ APPROVER2, ✓ STEWARD`
          );
          console.log('══════════════════════════════════');
        } finally {
          await resetAdminConfigBestEffort(
            adminPage,
            admin,
            adminActions,
            RESET_CONFIG,
            'finally reset'
          );
          console.log('\n[Cleanup] Closing all contexts...');
          await adminCtx.close();
          await requestorCtx.close();
          await approver1Ctx.close();
          await approver2Ctx.close();
          await stewardCtx.close();
          console.log('[Cleanup] ✅ All contexts closed');
        }
      }
    );
  }
);
