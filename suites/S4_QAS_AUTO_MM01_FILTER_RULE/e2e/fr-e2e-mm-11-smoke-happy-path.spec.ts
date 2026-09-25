import { test, expect } from '@playwright/test';
import { AdminFilterRulePage } from '../../../pages/admin/AdminFilterRulePage';
import { MainFilterRuleVerifyPage } from '../../../pages/verify/MainFilterRuleVerifyPage';
import { MyRequestPage, CRHeaderParams } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('fr-e2e-mm-11');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_FILTER_RULE.name;

test.describe(
  'FR-E2E-MM-11: E2E Smoke - Filter Rule Happy Path',
  { tag: ['@rules', '@filter-rule', '@mm', '@bp:filter-rule'] },
  () => {
    test(
      'Admin: Create R1 → Requestor: Copy CR → Set Plant=0001 → Verify Filter → Submit → Cancel CR → Cleanup (simplified)',
      { tag: ['@smoke', '@happy-path', '@TC-17'] },
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

        const adminFR = new AdminFilterRulePage(adminPage);
        const mainFR = new MainFilterRuleVerifyPage(requestorPage);
        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);

        const description = `${TD.description} [AUTO] ${generateTimestamp()}`;
        const testValue = '0001';
        let newCR = '';

        try {
          // ════════════════════════════════════════════════════════════════
          // PHASE 1: ADMIN — Create Filter Rule (R1)
          // ════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 1: ADMIN — Create Filter Rule R1');
          console.log('══════════════════════════════════════');
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminFR.navigateToFilterRule(TEMPLATE_NAME);
          await adminFR.createFilterRule({
            sourceSection: 'PLANTDATA',
            sourceField: 'plant',
            targetSection: 'LOTSIZEDATA',
            targetField: 'storageCostsPercentageCode',
            targetProperty: 'plant',
          });
          await adminFR.verifyToast('Business Rule Created');
          console.log('\n✅ PHASE 1 COMPLETE — Filter Rule R1 created');

          // ════════════════════════════════════════════════════════════════
          // PHASE 2: REQUESTOR — Copy CR → Fill header → Source/Target → Submit
          // ════════════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 2: REQUESTOR — Copy CR & Verify Filter');
          console.log('======================================');
          await loginAs(
            requestorPage,
            suiteConfig.accounts.requestor.user,
            suiteConfig.accounts.requestor.pass
          );
          await myRequest.goto();
          await myRequest.openCopyRequest(suiteConfig.sourceCRs.default, 'Material Number');

          // Use fillHeader for description + priority + notes (replaces fillDescription/selectPriority/fillNotes)
          const headerData: CRHeaderParams = {
            description,
            priority: 'Medium',
            notes: `Automated test: ${description}`,
          };
          await myRequest.fillHeader(headerData);
          console.log(`✅ [TC-11] Header filled: "${description}"`);

          // ─── Step 1: Source — select Plant=0001 via Plant Data section ───
          console.log(
            `\n🔷 [TC-11] SOURCE: Set Plant=${testValue} (R1: PLANTDATA/plant → LOTSIZEDATA/storageCostsPercentageCode)`
          );
          await mainFR.selectTab('Plant Data');
          await mainFR.waitForSection('Plant Data');
          await mainFR.clickAddButtonInSection('Plant Data');
          await mainFR.waitForSection('Plant Data');
          await mainFR.clickF4Icon(0);
          await mainFR.selectF4Value(testValue);
          await mainFR.selectFirstRowInDialog();
          console.log(`✅ [TC-11] Source Plant=${testValue} selected`);

          // ─── Step 2: Target — Open F4, Search, Verify filter, Select value ───
          console.log(
            `\n🔷 [TC-11] TARGET: Verify Storage Costs Code filtered by Plant=${testValue}`
          );
          await mainFR.selectTab('MRP1');
          await mainFR.verifyLabelVisible('Storage Costs Code');
          await mainFR.clickF4Icon(12);

          // Search + verify all rows = Plant=0001
          await mainFR.verifyColumnValuesInF4Dialog('Plant', testValue);

          // Select first value → F4 closes → value committed
          await mainFR.selectFirstRowInDialog();
          console.log(`✅ [TC-11] Target value selected for Storage Costs Code`);

          // Close remaining dialog (Plant Data Add dialog) before submit
          await mainFR.closeAddDialog();
          console.log(`✅ [TC-11] Remaining dialog closed`);

          // ─── Step 3: Submit CR ───
          console.log(`\n🔷 [TC-11] SUBMIT: Submitting CR`);
          await requestorPage
            .locator('#sap-ui-blocklayer-popup')
            .waitFor({ state: 'hidden', timeout: 10000 })
            .catch(() => {});
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`✅ [TC-11] CR submitted: ${newCR}`);
          // Cancel CR directly (no need to open CR to verify — already confirmed via F4 filter)
          console.log(`\n🔷 [TC-11] Cancelling CR ${newCR} (cleanup)...`);
          await myRequest.goto();
          await myRequest.cancelCR(newCR);
          console.log(`✅ [TC-11] CR ${newCR} cancelled — data cleaned`);

          console.log('\n══════════════════════════════════════');
          console.log('  ✅ TC-11 E2E SMOKE — ALL CHECKS PASSED');
          console.log('══════════════════════════════════════');
        } finally {
          try {
            // Ensure admin page is on the correct URL (may have been redirected to IAS login)
            await adminPage.goto(`${process.env.BASE_URL}/admin/index.html`, {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            });
            await adminPage.waitForTimeout(3000);
            await adminFR.navigateToFilterRule(TEMPLATE_NAME);
            await adminFR.deleteFilterRule('PLANTDATA', 'storageCostsPercentageCode');
          } catch (e) {
            console.log(
              `[Cleanup] Admin cleanup error (non-fatal): ${e instanceof Error ? e.message : e}`
            );
          }
          await adminCtx.close();
          await requestorCtx.close();
        }
      }
    );
  }
);
