import { test, expect } from '@playwright/test';
import { MyRequestPage } from '../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../pages/cr/CopyRequestForm';
import { MyInboxPage } from '../../pages/cr/MyInboxPage';
import { ActivationPage } from '../../pages/activation/ActivationPage';
import { loginAs } from '../../helpers/auth';
import { suiteConfig, getTestData } from '../../suites/S4_QAS_AUTO_BP01/suite.config';
import { ApproverActions, createApproverActions } from '../../pages/actions/ApproverActions';
import { StewardActions, createStewardActions } from '../../pages/actions/StewardActions';

const TD = getTestData('smoke-bp-08');
const SC = { templates: suiteConfig.templates };

/**
 * TC08 — Full Flow với Multi-Context (Session Isolation)
 *
 * Mỗi role dùng browser context riêng — session hoàn toàn độc lập:
 *   Requestor → Context 1
 *   Approver  → Context 2
 *   Steward   → Context 3
 *
 * Note: playwright-sap chỉ hỗ trợ Chromium engine với UI5 extension
 * Multi-context thay thế multi-browser — đảm bảo session isolation
 *
 * Cross-role verify sau mỗi phase:
 *   After Approver approve → Requestor verify Status: APPROVED
 *   After Steward activate → Requestor verify Status: APPROVED + Activation: ACTIVATED
 */
test.describe(
  'SMOKE-08: Copy Request → Approve → Steward Activate (multi-context)',
  { tag: ['@bp'] },
  () => {
    const SOURCE_CR = 'CR0000015052';
    const TEMPLATE_KEY = '6e666348-ff4a-4088-8287-274a92ab326c';

    test.describe('Full flow checks', { tag: ['@bp'] }, () => {
      test(
        '01 - Copy CR → Approve → Activate with cross-role verify',
        { tag: ['@smoke', '@workflow', '@happy-path'] },
        async ({ browser }) => {
          test.setTimeout(420000); // 7 phút

          // ── Khởi tạo 3 contexts độc lập ──────────────────────────────────────
          // Mỗi context có session riêng — không ảnh hưởng nhau
          // Tất cả đều full HD
          const requestorCtx = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
          });
          const approverCtx = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
          });
          const stewardCtx = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
          });

          const requestorPage = await requestorCtx.newPage();
          const approverPage = await approverCtx.newPage();
          const stewardPage = await stewardCtx.newPage();

          // Sau khi tạo page — set title để phân biệt
          await requestorPage.evaluate(() => {
            document.title = '[REQUESTOR] SimpleMDG';
          });
          await approverPage.evaluate(() => {
            document.title = '[APPROVER] SimpleMDG';
          });
          await stewardPage.evaluate(() => {
            document.title = '[STEWARD] SimpleMDG';
          });

          // Page Objects — for navigation
          const myRequest = new MyRequestPage(requestorPage);
          const form = new CopyRequestForm(requestorPage);
          const myInbox = new MyInboxPage(approverPage);
          const activation = new ActivationPage(stewardPage);

          // Action Classes — for actions
          const approver = createApproverActions(approverPage);
          const steward = createStewardActions(stewardPage);

          try {
            let newCR = '';
            await test.step('Phase 1 - Requestor copy and submit CR', async () => {
              console.log('');
              console.log('══════════════════════════════════════');
              console.log('  PHASE 1: REQUESTOR [Context 1] — Submit CR');
              console.log('══════════════════════════════════════');

              await myRequest.login();
              await myRequest.goto();
              await myRequest.openCopyRequest(SOURCE_CR);

              // Fill header fields using MyRequestPage
              await myRequest.fillHeader({
                description: TD.description,
                priority: TD.priority,
                notes: TD.notes,
              });
              await form.selectTemplate(SC.templates.AUTO_BP01.key, TD.templateName);

              newCR = await form.submit();
              console.log(`[Requestor] CR created: ${newCR}`);

              await myRequest.waitForStatus(newCR, 'SUBMITTED');
              await myRequest.verifyStatus(newCR, 'SUBMITTED');

              console.log('');
              console.log(`✅ PHASE 1 COMPLETE — CR ${newCR} → SUBMITTED`);
            });

            await test.step('Phase 2 - Approver approve CR', async () => {
              console.log('');
              console.log('══════════════════════════════════════');
              console.log('  PHASE 2: APPROVER [Context 2] — Approve CR');
              console.log('══════════════════════════════════════');

              await loginAs(
                approverPage,
                process.env.APPROVER_USER || '',
                process.env.APPROVER_PASS || ''
              );
              await myInbox.goto();
              await myInbox.searchCR(newCR);
              await myInbox.openCRDetail(newCR);
              await approver.approve(newCR);
              await myInbox.verifyCRLeft(newCR);

              console.log('');
              console.log(`✅ PHASE 2 COMPLETE — CR ${newCR} approved`);
            });

            await test.step('Cross-verify - Requestor sees APPROVED', async () => {
              console.log('');
              console.log('── Cross-verify [Context 1]: Requestor verify APPROVED ──');
              await myRequest.searchCR(newCR);
              await myRequest.verifyStatus(newCR, 'APPROVED');
              console.log(`✅ Cross-verify PASSED — Requestor sees CR ${newCR} → APPROVED`);
            });

            await test.step('Phase 3 - Steward activate CR', async () => {
              console.log('');
              console.log('══════════════════════════════════════');
              console.log('  PHASE 3: STEWARD [Context 3] — Activate CR');
              console.log('══════════════════════════════════════');

              await loginAs(
                stewardPage,
                process.env.STEWARD_USER || '',
                process.env.STEWARD_PASS || ''
              );
              await activation.goto();
              await steward.search(newCR);
              await steward.verifyStatus('UNASSIGNED');
              await steward.assign(newCR);
              await steward.verifyStatus('ASSIGNED');
              await steward.approve(newCR);
              await steward.verifyStatus('INPROGRESS');
              await steward.waitForActivated(newCR);
              await steward.verifyStatus('ACTIVATED');

              console.log('');
              console.log(`✅ PHASE 3 COMPLETE — CR ${newCR} → ACTIVATED`);
            });

            await test.step('Cross-verify - Requestor sees APPROVED + ACTIVATED', async () => {
              console.log('');
              console.log('── Cross-verify [Context 1]: Requestor verify APPROVED + ACTIVATED ──');
              await myRequest.searchCR(newCR);
              await myRequest.verifyBothStatuses(newCR, 'APPROVED', 'ACTIVATED');
              console.log(`✅ Cross-verify PASSED — Requestor sees CR ${newCR}`);
              console.log(`   Status: APPROVED ✓  Activation Status: ACTIVATED ✓`);
            });

            console.log('');
            console.log('══════════════════════════════════════');
            console.log(`✅ TC08 PASSED`);
            console.log(`   CR: ${newCR}`);
            console.log(`   Flow: SUBMITTED → APPROVED → ACTIVATED`);
            console.log(`   Cross-role verify: ✓ APPROVED, ✓ ACTIVATED`);
            console.log('══════════════════════════════════════');
          } finally {
            console.log('[Cleanup] Closing all contexts...');
            await requestorCtx.close();
            await approverCtx.close();
            await stewardCtx.close();
            console.log('[Cleanup] ✅ All contexts closed');
          }
        }
      );
    });
  }
);
