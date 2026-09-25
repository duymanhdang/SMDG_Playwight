import { test } from '@playwright/test';
import { AdminVisibleRulePage } from '../../../pages/admin/AdminVisibleRulePage';
import { MainVisibleRuleVerifyPage } from '../../../pages/verify/MainVisibleRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, suiteData, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('vr-e2e-mm-04') as any;

test.describe(
  'VR-E2E-MM-04: Dimensions — R7+R8 Same-Section Rules',
  { tag: ['@rules', '@visible-rule', '@mm', '@bp:visible-rule'] },
  () => {
    test(
      'Create R7+R8 → Fill Gross Weight + Volume → Submit → Reopen verify → Cancel → Cleanup',
      { tag: ['@admin', '@workflow', '@happy-path', '@TC-03'] },
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
          //  PHASE 1: ADMIN — Create Rules R7+R8
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 1: ADMIN — Create Rules R7+R8');
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
              sourceValue: rule.sourceValue === '*' ? undefined : rule.sourceValue,
              acceptedAnyValue: rule.sourceValue === '*',
            });
          }

          console.log(`\n-- [OK] PHASE 1 COMPLETE — ${rules.length} rule(s) created --`);

          // ═══════════════════════════════════════════════════════════
          //  PHASE 2: REQUESTOR — Fill sources → Verify targets → Submit
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

          await mainVR.navigateToTargetArea('Dimensions/EANs');

          // R7: Gross Weight → Net Weight
          console.log('\n-- R7: Gross Weight → Net Weight --');
          await mainVR.setInputByLabel('Gross Weight', '10.000');
          await mainVR.verifyFieldLabel('Net Weight');
          await mainVR.setInputByLabel('Net Weight', '5.000');

          // R8: Volume (any) → Size/dimensions
          console.log('\n-- R8: Volume → Size/dimensions --');
          await mainVR.setInputByLabel('Volume', '10');
          await mainVR.verifyFieldLabel('Size/dimensions');

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
          await mainVR.navigateToTargetArea('Dimensions/EANs');
          await mainVR.verifyFieldLabel('Net Weight');
          await mainVR.verifyFieldLabel('Size/dimensions');

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
          console.log('[OK] VR-E2E-MM-04 PASSED');
          console.log(`  Rules: R7+R8 (Dimensions)`);
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
