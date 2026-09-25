import { test } from '@playwright/test';
import { AdminVisibleRulePage } from '../../../pages/admin/AdminVisibleRulePage';
import { MainVisibleRuleVerifyPage } from '../../../pages/verify/MainVisibleRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { MyInboxPage } from '../../../pages/cr/MyInboxPage';
import { ActivationPage } from '../../../pages/activation/ActivationPage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, suiteData, getTestData, generateTimestamp } from '../suite.config';
import { createApproverActions } from '../../../pages/actions/ApproverActions';
import { createStewardActions } from '../../../pages/actions/StewardActions';

const TD = getTestData('vr-e2e-mm-03') as any;

test.describe(
  'VR-E2E-MM-03: ComboBox + Textarea — R3 ComboBox + R4 Textarea',
  { tag: ['@rules', '@visible-rule', '@mm', '@bp:visible-rule'] },
  () => {
    test(
      'Admin: Create R3+R4 → Requestor: Fill combo + textarea, Update → Approver: Verify → Steward: Activate → Cleanup',
      { tag: ['@admin', '@workflow', '@happy-path', '@TC-02'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const approverCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const stewardCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

        const adminPage = await adminCtx.newPage();
        const requestorPage = await requestorCtx.newPage();
        const approverPage = await approverCtx.newPage();
        const stewardPage = await stewardCtx.newPage();

        await adminPage.evaluate(() => {
          document.title = '[ADMIN] SimpleMDG';
        });
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR] SimpleMDG';
        });
        await approverPage.evaluate(() => {
          document.title = '[APPROVER] SimpleMDG';
        });
        await stewardPage.evaluate(() => {
          document.title = '[STEWARD] SimpleMDG';
        });

        const adminVR = new AdminVisibleRulePage(adminPage);
        const mainVR = new MainVisibleRuleVerifyPage(requestorPage);
        const approverVR = new MainVisibleRuleVerifyPage(approverPage);
        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);
        const myInbox = new MyInboxPage(approverPage);
        const activation = new ActivationPage(stewardPage);
        const approver = createApproverActions(approverPage);
        const steward = createStewardActions(stewardPage);

        const rules = TD.adminRules.map((id: string) => {
          const ref = (suiteData.rules as Record<string, any>)[id];
          return { ...ref, _id: id };
        });
        let newCR = '';

        try {
          // ═══════════════════════════════════════════════════════════
          //  PHASE 1: ADMIN — Create Rules R3+R4
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 1: ADMIN — Create Rules R3+R4');
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
              sourceValue: rule.sourceValue,
            });
          }

          console.log(`\n-- [OK] PHASE 1 COMPLETE — ${rules.length} rule(s) created --`);

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

          // R3: Dialog-based — Forecasting tab in Plant Data dialog
          console.log('\n-- R3: Set Selection Procedure combobox, verify Model selection --');
          await mainVR.navigateToTargetArea('Plant Data');
          await mainVR.clickOpenSectionButton(22);
          await mainVR.verifyDialogTitle('Plant Data');
          await mainVR.clickDialogTab('More');
          await mainVR.clickOverflowTab('Forecasting');
          await mainVR.verifyFieldLabel('Selection procedure');
          await mainVR.clickDropdownIcon(2);
          await mainVR.selectDropdownItem('1');
          await mainVR.verifyFieldLabel('Model selection');
          await mainVR.updateDialog();

          // R4: Direct form — Basic Data Texts textarea
          console.log(
            '\n-- R4: Fill Basic Text / Language textarea, verify Language MultiInput --'
          );
          await mainVR.verifyHeading('Basic Data Texts');
          await mainVR.verifyFieldLabel('Basic Text / Language');
          await mainVR.fillTextAreaByLabel('Basic Text / Language', 'EN');
          await mainVR.verifyTargetMultiInputVisible(15);

          // Submit (auto-saves)
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);

          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterSubmit);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterSubmit);

          console.log(
            `\n[OK] PHASE 2 COMPLETE — CR ${newCR} -> ${TD.expectedStatuses.afterSubmit}`
          );

          // ═══════════════════════════════════════════════════════════
          //  PHASE 3: APPROVER — Verify targets + Approve
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 3: APPROVER — Verify + Approve');
          console.log('======================================');

          await loginAs(
            approverPage,
            suiteConfig.accounts.approver.user,
            suiteConfig.accounts.approver.pass
          );
          await myInbox.goto();
          await myInbox.searchCR(newCR);
          await myInbox.openCRDetail(newCR, 'Product', 'Material Number');

          // Verify R3 target (Model selection in Forecasting tab)
          await approverVR.navigateToTargetArea('Plant Data');
          await approverVR.clickOpenSectionButton(22);
          await approverVR.verifyDialogTitle('Plant Data');
          await approverVR.clickDialogTab('More');
          await approverVR.clickOverflowTab('Forecasting');
          await approverVR.verifyFieldLabel('Model selection');
          await approverVR.closeDialog();

          // Verify R4 target (Language MultiInput)
          await approverVR.verifyTargetMultiInputVisible(15);

          await approver.approve(newCR, undefined, 'Material Number');
          await myInbox.verifyCRLeft(newCR);

          console.log(`\n[OK] PHASE 3 COMPLETE — CR ${newCR} approved`);

          // ═══════════════════════════════════════════════════════════
          //  PHASE 4: STEWARD — Activate CR
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 4: STEWARD — Activate CR');
          console.log('======================================');

          await loginAs(
            stewardPage,
            suiteConfig.accounts.steward.user,
            suiteConfig.accounts.steward.pass
          );
          await activation.goto();
          await steward.search(newCR);
          await steward.verifyRowStatus(newCR, 'UNASSIGNED');
          await steward.assign(newCR);
          await steward.verifyRowStatus(newCR, 'ASSIGNED');
          await steward.approve(newCR);
          await steward.verifyRowStatus(newCR, 'INPROGRESS');
          await steward.waitForActivatedRow(newCR);
          await steward.verifyRowStatus(newCR, 'ACTIVATED');

          console.log(`\n[OK] PHASE 4 COMPLETE — CR ${newCR} -> ACTIVATED`);

          console.log('\n======================================');
          console.log('[OK] VR-E2E-MM-03 PASSED');
          console.log(`  Rules: R3 (ComboBox) + R4 (Textarea)`);
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
          await approverCtx.close();
          await stewardCtx.close();
          console.log('[Cleanup] [OK] Contexts closed');
        }
      }
    );
  }
);
