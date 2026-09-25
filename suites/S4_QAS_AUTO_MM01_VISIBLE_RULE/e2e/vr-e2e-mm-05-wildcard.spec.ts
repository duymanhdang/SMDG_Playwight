import { test } from '@playwright/test';
import { AdminVisibleRulePage } from '../../../pages/admin/AdminVisibleRulePage';
import { MainVisibleRuleVerifyPage } from '../../../pages/verify/MainVisibleRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, suiteData, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('vr-e2e-mm-05') as any;

test.describe(
  'VR-E2E-MM-05: Wildcard — R5 Any-Value Source',
  { tag: ['@rules', '@visible-rule', '@mm', '@bp:visible-rule'] },
  () => {
    test(
      'Create R5 (*) → Fill Lab/Office → Verify Material freight grp → Submit → Reopen verify → Cancel → Cleanup',
      { tag: ['@admin', '@workflow', '@happy-path', '@TC-04'] },
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

        const rules = TD.adminRules.map((id: string) => {
          const ref = (suiteData.rules as Record<string, any>)[id];
          return { ...ref, _id: id };
        });
        let newCR = '';

        try {
          // ═══════════════════════════════════════════════════════════
          //  PHASE 1: ADMIN — Create Rule R5
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 1: ADMIN — Create Rule R5');
          console.log('======================================');

          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminVR.navigateToVisibleRule(suiteConfig.templates.AUTO_MM01_VISIBLE_RULE.name);

          for (const rule of rules) {
            await adminVR.createVisibleRule({
              sourceSection: rule.sourceSection,
              sourceField: rule.sourceField,
              targetSection: rule.targetSection,
              targetField: rule.targetField,
              acceptedAnyValue: true,
            });
          }

          console.log(`\n-- [OK] PHASE 1 COMPLETE — R5 created --`);

          // ═══════════════════════════════════════════════════════════
          //  PHASE 2: REQUESTOR — Fill source + Verify target + Submit
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 2: REQUESTOR — Fill + Verify + Submit');
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

          // R5: Lab/Office (F4) → Material freight grp in Plant Data dialog
          // Source: Lab/Office in Basic Data section
          console.log('\n-- R5: Set Lab/Office, verify Material freight grp --');
          await mainVR.verifyFieldLabel('Lab/Office');
          await mainVR.clickF4Icon(6);
          await mainVR.searchAndSelectF4('001');
          await mainVR.selectF4ValueByXPathDialog(1);

          // Navigate to Plant Data → open dialog → verify target
          await mainVR.navigateToTargetArea('Plant Data');
          await mainVR.clickOpenSectionButton(22);
          await mainVR.verifyDialogTitle('Plant Data');
          await mainVR.verifyFieldLabel('Material freight grp');
          await mainVR.closeDialog();

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
          await mainVR.navigateToTargetArea('Plant Data');
          await mainVR.clickOpenSectionButton(22);
          await mainVR.verifyDialogTitle('Plant Data');
          await mainVR.verifyFieldLabel('Material freight grp');
          await mainVR.closeDialog();

          console.log(`\n[OK] PHASE 3 COMPLETE — Target persists after submit`);

          // ═══════════════════════════════════════════════════════════
          //  PHASE 4: REQUESTOR — Cancel CR
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 4: REQUESTOR — Cancel CR');
          console.log('======================================');

          await myRequest.cancelCR(newCR);

          console.log(`\n[OK] PHASE 4 COMPLETE — CR ${newCR} cancelled`);

          console.log('\n======================================');
          console.log('[OK] VR-E2E-MM-05 PASSED');
          console.log(`  Rules: R5 (wildcard)`);
          console.log(`  CR: ${newCR}`);
          console.log('======================================');
        } finally {
          console.log('\n[Cleanup] Deleting rules...');
          for (const rule of rules) {
            await adminVR.safeDeleteVisibleRule(rule.sourceSection, rule.targetField);
          }
          console.log('\n[Cleanup] Closing contexts...');
          await adminCtx.close();
          await requestorCtx.close();
          console.log('[Cleanup] [OK] Contexts closed');
        }
      }
    );
  }
);
