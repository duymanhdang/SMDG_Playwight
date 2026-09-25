import { test, expect } from '@playwright/test';
import { AdminFilterRulePage } from '../../../pages/admin/AdminFilterRulePage';
import { MainFilterRuleVerifyPage } from '../../../pages/verify/MainFilterRuleVerifyPage';
import { MyRequestPage, CRHeaderParams } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { loginAs } from '../../../helpers/auth';
import { saveDraft, reopenLatestDraft } from '../../../helpers/workflow';
import { suiteConfig, getTestData, suiteData } from '../suite.config';

const TD = getTestData('fr-e2e-mm-09');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_FILTER_RULE.name;
const R4 = suiteData.filterRules.R4;

test.describe(
  'FR-E2E-MM-09: Copy & Draft',
  { tag: ['@rules', '@filter-rule', '@mm', '@bp:filter-rule'] },
  () => {
    test(
      'R4: Copy CR → Verify rule → Save Draft → See Draft → Reopen → Verify → Submit → Cancel',
      { tag: ['@happy-path', '@TC-15'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const adminPage = await adminCtx.newPage();
        const requestorPage = await requestorCtx.newPage();
        await adminPage.evaluate(() => {
          document.title = '[ADMIN]';
        });
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR]';
        });

        const adminFR = new AdminFilterRulePage(adminPage);
        const mainFR = new MainFilterRuleVerifyPage(requestorPage);
        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);

        const description = `${TD.description} [AUTO] ${new Date().getTime()}`;
        let newCR = '';

        try {
          // ═══════════════════════════════════════════
          // SETUP: Admin creates R4
          // ═══════════════════════════════════════════
          console.log('\n═══ SETUP: Admin creates R4 (Alternative Unit→Unit of Dimension) ═══');
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminFR.navigateToFilterRule(TEMPLATE_NAME);
          await adminFR.createFilterRule({
            sourceSection: R4.sourceSection,
            sourceField: R4.sourceField,
            targetSection: R4.targetSection,
            targetField: R4.targetField,
            targetProperty: R4.property,
          });
          await adminFR.verifyToast('Business Rule Created');
          console.log('✅ R4 created');

          // ═══════════════════════════════════════════
          // PHASE 1: Copy CR → Verify rule → Save Draft
          // ═══════════════════════════════════════════
          console.log('\n═══ PHASE 1: Copy CR → Verify rule → Save Draft ═══');
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

          // Open Units of Measure dialog (R4 — same dialog for source + target)
          await mainFR.navigateToTargetArea('Units of Measure');
          await mainFR.clickAddButtonBySectionTitle('Units of Measure');
          await mainFR.waitForSection('Units of Measure');

          // Set source: Alternative Unit = DM
          await mainFR.clickF4ByLabel(R4.sourceLabel);
          await mainFR.selectF4Value(R4.testValue);
          await mainFR.selectFirstRowInDialog(R4.testValue);

          // Verify target: Unit of Dimension filtered to DM
          await mainFR.clickF4ByLabel(R4.targetLabel);
          await mainFR.verifyColumnValuesInF4Dialog(R4.verifyColumn, R4.testValue);
          await mainFR.closeAddDialog();

          // Cancel dialog (no Add — verifying filter only)
          await mainFR.closeAddDialog();
          console.log('✅ Rule verified (Alternative Unit=DM → Unit of Dimension filtered)');

          // Save as Draft
          await saveDraft(requestorPage);
          console.log('✅ CR saved as draft');

          // ═══════════════════════════════════════════
          // PHASE 2: See Draft → Reopen → Verify → Submit → SUBMITTED → Cancel
          // ═══════════════════════════════════════════
          console.log('\n═══ PHASE 2: See Draft → Reopen → Verify → Submit ═══');
          await reopenLatestDraft(requestorPage);
          console.log('✅ Draft reopened');

          // Verify rule again in reopened CR (set source again, verify filter, cancel)
          await mainFR.navigateToTargetArea('Units of Measure');
          await mainFR.clickAddButtonBySectionTitle('Units of Measure');
          await mainFR.waitForSection('Units of Measure');

          await mainFR.clickF4ByLabel(R4.sourceLabel);
          await mainFR.selectF4Value(R4.testValue);
          await mainFR.selectFirstRowInDialog(R4.testValue);

          await mainFR.clickF4ByLabel(R4.targetLabel);
          await mainFR.verifyColumnValuesInF4Dialog(R4.verifyColumn, R4.testValue);
          await mainFR.closeAddDialog();

          await mainFR.closeAddDialog();
          console.log('✅ Rule re-verified after reopen (filter still active)');

          // Submit
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`✅ CR submitted: ${newCR}`);

          // Verify SUBMITTED
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterSubmit);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterSubmit);
          console.log(`✅ Status: ${TD.expectedStatuses.afterSubmit}`);

          // Cancel CR
          await myRequest.cancelCR(newCR);
          console.log('✅ CR cancelled');

          // ═══════════════════════════════════════════
          // CLEANUP
          // ═══════════════════════════════════════════
          console.log('\n═══ CLEANUP ═══');
          await requestorPage.context().close();
          await adminPage.goto(`${process.env.BASE_URL}/admin/index.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await adminPage.waitForTimeout(3000);
          await adminFR.navigateToFilterRule(TEMPLATE_NAME);
          await adminFR.deleteFilterRule(R4.sourceSection, R4.targetField);
          console.log('✅ R4 deleted');

          console.log('\n══════════════════════════════════════');
          console.log('  ✅ TC-09: COPY & DRAFT — ALL CHECKS PASSED');
          console.log('══════════════════════════════════════');
        } finally {
          await adminCtx.close().catch(() => {});
          await requestorCtx.close().catch(() => {});
        }
      }
    );
  }
);
