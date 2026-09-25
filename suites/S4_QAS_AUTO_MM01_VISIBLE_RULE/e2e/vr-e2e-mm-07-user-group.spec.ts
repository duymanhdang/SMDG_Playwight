import { test } from '@playwright/test';
import { AdminVisibleRulePage } from '../../../pages/admin/AdminVisibleRulePage';
import { MainVisibleRuleVerifyPage } from '../../../pages/verify/MainVisibleRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, suiteData, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('vr-e2e-mm-07') as any;

test.describe(
  'VR-E2E-MM-07: R6 (userID) → Copy CR → Submit → Cancel',
  { tag: ['@rules', '@visible-rule', '@mm', '@bp:visible-rule'] },
  () => {
    test(
      'Create R6 → Copy CR → Verify → Submit → Reopen → Cancel → Cleanup',
      { tag: ['@admin', '@workflow', '@happy-path', '@TC-06'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

        const adminPage = await adminCtx.newPage();
        const requestorPage = await requestorCtx.newPage();

        await adminPage.evaluate(() => {
          document.title = '[ADMIN] SimpleMDG';
        });
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR] SimpleMDG';
        });

        const adminVR = new AdminVisibleRulePage(adminPage);
        const mainVR = new MainVisibleRuleVerifyPage(requestorPage);
        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);

        const r6Ref = (suiteData.rules as Record<string, any>)['R6'];
        let newCR = '';

        try {
          // ═══════════════════════════════════════════════════════════
          //  PHASE 1: ADMIN — Create R6
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 1: ADMIN — Create Rule R6');
          console.log('======================================');

          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminVR.navigateToVisibleRule(suiteConfig.templates.AUTO_MM01_VISIBLE_RULE.name);

          await adminVR.createUserAttributeRule({
            userAttribute: r6Ref.userAttribute,
            targetSection: r6Ref.targetSection,
            targetField: r6Ref.targetField,
            sourceValue: r6Ref.sourceValue,
          });

          console.log(`\n-- [OK] PHASE 1 COMPLETE — R6 created --`);

          // ═══════════════════════════════════════════════════════════
          //  PHASE 2: REQUESTOR — Copy CR → Verify → Submit
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 2: REQUESTOR — Copy CR → Verify → Submit');
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

          // R6: Verify "Effectivity Parameter" checkbox visible in Basic Data
          console.log('\n-- R6: Verify Effectivity Parameter checkbox visible --');
          await mainVR.navigateToTargetArea('Basic Data');
          await mainVR.verifyCheckboxVisible('Effectivity Parameter');

          // Submit
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);

          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterSubmit);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterSubmit);

          console.log(
            `\n[OK] PHASE 2 COMPLETE — CR ${newCR} -> ${TD.expectedStatuses.afterSubmit}`
          );

          // ═══════════════════════════════════════════════════════════
          //  PHASE 3: REQUESTOR — Reopen + Verify Persistence
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 3: REQUESTOR — Reopen + Verify');
          console.log('======================================');

          await myRequest.openCRDetail(newCR, 'Material Number');

          await mainVR.navigateToTargetArea('Basic Data');
          await mainVR.verifyCheckboxVisible('Effectivity Parameter');

          console.log(`\n[OK] PHASE 3 COMPLETE — Targets persist after submit`);

          // ═══════════════════════════════════════════════════════════
          //  PHASE 4: REQUESTOR — Cancel CR
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 4: REQUESTOR — Cancel CR');
          console.log('======================================');

          await myRequest.cancelCR(newCR);
          console.log(`\n[OK] PHASE 4 COMPLETE — CR ${newCR} cancelled`);

          console.log('\n======================================');
          console.log('[OK] VR-E2E-MM-07 PASSED');
          console.log(`  Rules: R6 (userID → Effectivity Parameter)`);
          console.log(`  CR: ${newCR}`);
          console.log('======================================');
        } finally {
          console.log('\n[Cleanup] Deleting rules...');
          await adminVR.safeDeleteUserAttributeRule(r6Ref.targetField);
          console.log('\n[Cleanup] Closing contexts...');
          await adminCtx.close();
          await requestorCtx.close();
          console.log('[Cleanup] [OK] Contexts closed');
        }
      }
    );
  }
);
