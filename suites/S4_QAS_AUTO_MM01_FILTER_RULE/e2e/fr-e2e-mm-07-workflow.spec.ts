import { test, expect } from '@playwright/test';
import { AdminFilterRulePage } from '../../../pages/admin/AdminFilterRulePage';
import { MainFilterRuleVerifyPage } from '../../../pages/verify/MainFilterRuleVerifyPage';
import { MyRequestPage, CRHeaderParams } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { ActivationPage } from '../../../pages/activation/ActivationPage';
import { MyInboxPage } from '../../../pages/cr/MyInboxPage';
import { ApproverActions, createApproverActions } from '../../../pages/actions/ApproverActions';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData, suiteData } from '../suite.config';

const TD = getTestData('fr-e2e-mm-07');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_FILTER_RULE.name;
const R2 = suiteData.filterRules.R2;

test.describe(
  'FR-E2E-MM-07: Workflow (Approval/Resubmit)',
  { tag: ['@rules', '@filter-rule', '@mm', '@bp:filter-rule'] },
  () => {
    test(
      'R2 full E2E: Admin create → Requestor submit → Approver approve → Steward activate',
      { tag: ['@admin', '@workflow', '@happy-path', '@TC-13'] },
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
          document.title = '[ADMIN]';
        });
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR]';
        });
        await approverPage.evaluate(() => {
          document.title = '[APPROVER]';
        });
        await stewardPage.evaluate(() => {
          document.title = '[STEWARD]';
        });

        const adminFR = new AdminFilterRulePage(adminPage);
        const mainFR = new MainFilterRuleVerifyPage(requestorPage);
        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);
        const inbox = new MyInboxPage(approverPage);
        const approverActions = createApproverActions(approverPage);
        const activation = new ActivationPage(stewardPage);

        const description = `${TD.description} [AUTO] ${new Date().getTime()}`;
        let newCR = '';

        try {
          // ═══════════════════════════════════════════
          // SETUP: Admin creates R2
          // ═══════════════════════════════════════════
          console.log('\n═══ SETUP: Admin creates R2 ═══');
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminFR.navigateToFilterRule(TEMPLATE_NAME);
          await adminFR.createFilterRule({
            sourceSection: R2.sourceSection,
            sourceField: R2.sourceField,
            targetSection: R2.targetSection,
            targetField: R2.targetField,
            targetProperty: R2.property,
          });
          await adminFR.verifyToast('Business Rule Created');
          console.log('✅ R2 created');

          // ═══════════════════════════════════════════
          // PHASE 1: REQUESTOR — Copy CR → Source/Target → Submit
          // ═══════════════════════════════════════════
          console.log('\n═══ PHASE 1: Requestor — Submit CR with R2 ═══');
          await loginAs(
            requestorPage,
            suiteConfig.accounts.requestor.user,
            suiteConfig.accounts.requestor.pass
          );
          await myRequest.goto();
          await myRequest.openCopyRequest(suiteConfig.sourceCRs.default, 'Material Number');

          const headerData: CRHeaderParams = {
            description,
            priority: 'Medium',
            notes: `Automated: ${description}`,
          };
          await myRequest.fillHeader(headerData);
          console.log('✅ Header filled');

          // Source: Set Base Unit = BAG
          await mainFR.navigateToTargetArea('Basic Data');
          await mainFR.clickF4ByLabel('Base Unit of Measure');
          await mainFR.selectF4Value(R2.testValue);
          await mainFR.selectFirstRowInDialog(R2.testValue);

          // Target: Verify + select Order Unit filtered
          await mainFR.navigateToTargetArea('Purchasing Data');
          await mainFR.clickF4ByLabel('Order Unit');
          await mainFR.verifyColumnValuesInF4Dialog(R2.verifyColumn, R2.testValue);
          await mainFR.selectFirstRowInDialog(R2.testValue);

          // Submit
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`✅ CR submitted: ${newCR}`);

          // ═══════════════════════════════════════════
          // PHASE 2: APPROVER — Approve (no verify)
          // ═══════════════════════════════════════════
          console.log('\n═══ PHASE 2: Approver — Approve ═══');
          await loginAs(
            approverPage,
            suiteConfig.accounts.approver.user,
            suiteConfig.accounts.approver.pass
          );
          await inbox.goto();
          await inbox.searchCR(newCR);
          await inbox.openCRDetail(newCR, 'Product', 'Material Number');
          await approverActions.approve(newCR, suiteConfig.comments.approverApprove, 'Material Number');
          console.log('✅ CR approved');

          // ═══════════════════════════════════════════
          // PHASE 3: STEWARD — Activate (no verify)
          // ═══════════════════════════════════════════
          console.log('\n═══ PHASE 3: Steward — Activate ═══');
          await loginAs(
            stewardPage,
            suiteConfig.accounts.steward.user,
            suiteConfig.accounts.steward.pass
          );
          await activation.goto();
          await activation.searchCR(newCR);
          await activation.assignToMe(newCR);
          await activation.approve(newCR);
          await activation.waitForActivated(newCR);
          console.log('✅ CR activated');

          // ═══════════════════════════════════════════
          // CLEANUP
          // ═══════════════════════════════════════════
          console.log('\n═══ CLEANUP ═══');
          // Admin page is still on the Template Rules list from SETUP (never
          // navigated away) — deleteFilterRule() re-searches the rule itself,
          // so no need to re-navigate here (same as ar-e2e-mm-01's cleanup).
          await adminFR.deleteFilterRule(R2.sourceSection, R2.targetField);
          console.log('✅ R2 deleted');

          console.log('\n══════════════════════════════════════');
          console.log('  ✅ TC-07: WORKFLOW — ALL CHECKS PASSED');
          console.log('══════════════════════════════════════');
        } finally {
          await adminCtx.close().catch(() => {});
          await requestorCtx.close().catch(() => {});
          await approverCtx.close().catch(() => {});
          await stewardCtx.close().catch(() => {});
        }
      }
    );
  }
);
