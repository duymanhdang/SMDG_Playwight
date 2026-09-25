import { test, expect } from '@playwright/test';
import { AdminFilterRulePage } from '../../../pages/admin/AdminFilterRulePage';
import { MainFilterRuleVerifyPage } from '../../../pages/verify/MainFilterRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { NewRequestForm } from '../../../pages/cr/NewRequestForm';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData, suiteData } from '../suite.config';

const TD = getTestData('fr-e2e-mm-06');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_FILTER_RULE.name;
const R2 = suiteData.filterRules.R2;

test.describe(
  'FR-E2E-MM-06: State ON/OFF',
  { tag: ['@rules', '@filter-rule', '@mm', '@bp:filter-rule'] },
  () => {
    let adminCtx: any;
    let requestorCtx: any;
    let adminPage: any;
    let requestorPage: any;
    let adminFR: AdminFilterRulePage;
    let mainFR: MainFilterRuleVerifyPage;
    let myRequest: MyRequestPage;
    let newRequestForm: NewRequestForm;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(suiteConfig.timeouts.phaseTimeout);

      adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

      adminPage = await adminCtx.newPage();
      requestorPage = await requestorCtx.newPage();
      await adminPage.evaluate(() => {
        document.title = '[ADMIN]';
      });
      await requestorPage.evaluate(() => {
        document.title = '[REQUESTOR]';
      });

      adminFR = new AdminFilterRulePage(adminPage);
      mainFR = new MainFilterRuleVerifyPage(requestorPage);
      myRequest = new MyRequestPage(requestorPage);
      newRequestForm = new NewRequestForm(requestorPage);

      // Admin creates R2
      await loginAs(adminPage, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
      await adminFR.navigateToFilterRule(TEMPLATE_NAME);
      await adminFR.createFilterRule({
        sourceSection: R2.sourceSection,
        sourceField: R2.sourceField,
        targetSection: R2.targetSection,
        targetField: R2.targetField,
        targetProperty: R2.property,
      });
      await adminFR.verifyToast('Business Rule Created');
      console.log('✅ R2 created (state: ON)');

      // Login requestor once
      await loginAs(
        requestorPage,
        suiteConfig.accounts.requestor.user,
        suiteConfig.accounts.requestor.pass
      );
    });

    test.afterAll(async () => {
      console.log('\n═══ CLEANUP ═══');
      try {
        await adminPage.goto(`${process.env.BASE_URL}/admin/index.html`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await adminPage.waitForTimeout(3000);
        await adminFR.navigateToFilterRule(TEMPLATE_NAME);
        await adminFR.deleteFilterRule(R2.sourceSection, R2.targetField);
        console.log('✅ R2 deleted');
      } catch (e) {
        console.log(`[Cleanup] Error: ${e instanceof Error ? e.message : e}`);
      }
      await adminCtx.close().catch(() => {});
      await requestorCtx.close().catch(() => {});
    });

    test(
      'State: STATE_ON — Verify filter works (R2 enabled by default)',
      { tag: ['@state', '@TC-10'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.phaseTimeout);

        await myRequest.goto();
        await newRequestForm.openNewRequest('Product');
        await newRequestForm.selectTemplate(TEMPLATE_NAME, 'Material Number');

        // Source: Set Base Unit = BAG
        await mainFR.navigateToTargetArea('Basic Data');
        await mainFR.clickF4ByLabel('Base Unit of Measure');
        await mainFR.selectF4Value(R2.testValue);
        await mainFR.selectFirstRowInDialog(R2.testValue);

        // Target: Verify Order Unit filtered
        await mainFR.navigateToTargetArea('Purchasing Data');
        await mainFR.clickF4ByLabel('Order Unit');
        await mainFR.verifyColumnValuesInF4Dialog(R2.verifyColumn, R2.testValue);
        await mainFR.selectFirstRowInDialog(R2.testValue);
        console.log('✅ STATE_ON: Filter works');
      }
    );

    test(
      'State: STATE_OFF — Toggle OFF, verify filter no longer applies',
      { tag: ['@state', '@TC-11'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.phaseTimeout);

        // Re-navigate admin page before toggling (prevent session timeout)
        await adminPage.goto(`${process.env.BASE_URL}/admin/index.html`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await adminPage.waitForTimeout(3000);
        await adminFR.navigateToFilterRule(TEMPLATE_NAME);
        await adminFR.searchRuleBySourceSection(R2.sourceSection);
        await adminFR.verifyRuleRowVisible();
        await adminFR.toggleRuleState('OFF');

        // Requestor: Verify filter does NOT apply
        await myRequest.goto();
        await newRequestForm.openNewRequest('Product');
        await newRequestForm.selectTemplate(TEMPLATE_NAME, 'Material Number');

        await mainFR.navigateToTargetArea('Basic Data');
        await mainFR.clickF4ByLabel('Base Unit of Measure');
        await mainFR.selectF4Value(R2.testValue);
        await mainFR.selectFirstRowInDialog(R2.testValue);

        await mainFR.navigateToTargetArea('Purchasing Data');
        await mainFR.clickF4ByLabel('Order Unit');
        await mainFR.verifyF4HasMultipleRows();
        await mainFR.closeAddDialogEscape();
        console.log('✅ STATE_OFF: Filter no longer applies');
      }
    );

    test(
      'State: STATE_TOGGLE — Toggle back ON, verify filter works again',
      { tag: ['@state', '@TC-12'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.phaseTimeout);

        // Re-navigate admin page before toggling
        await adminPage.goto(`${process.env.BASE_URL}/admin/index.html`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await adminPage.waitForTimeout(3000);
        await adminFR.navigateToFilterRule(TEMPLATE_NAME);
        await adminFR.searchRuleBySourceSection(R2.sourceSection);
        await adminFR.verifyRuleRowVisible();
        await adminFR.toggleRuleState('ON');

        // Requestor: Verify filter works again
        await myRequest.goto();
        await newRequestForm.openNewRequest('Product');
        await newRequestForm.selectTemplate(TEMPLATE_NAME, 'Material Number');

        await mainFR.navigateToTargetArea('Basic Data');
        await mainFR.clickF4ByLabel('Base Unit of Measure');
        await mainFR.selectF4Value(R2.testValue);
        await mainFR.selectFirstRowInDialog(R2.testValue);

        await mainFR.navigateToTargetArea('Purchasing Data');
        await mainFR.clickF4ByLabel('Order Unit');
        await mainFR.verifyColumnValuesInF4Dialog(R2.verifyColumn, R2.testValue);
        await mainFR.selectFirstRowInDialog(R2.testValue);
        console.log('✅ STATE_TOGGLE: Filter works again');
      }
    );
  }
);
