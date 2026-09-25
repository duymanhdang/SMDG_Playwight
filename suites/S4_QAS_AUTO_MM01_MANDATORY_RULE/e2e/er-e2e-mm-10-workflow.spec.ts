import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { loginAs } from '../../../helpers/auth';
import { AdminMandatoryRulePage } from '../../../pages/admin/AdminMandatoryRulePage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { MainMandatoryRuleVerifyPage } from '../../../pages/verify/MainMandatoryRuleVerifyPage';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { submitCRWithConfirm, waitForCRStatus } from '../../../helpers/workflow';
import { suiteConfig } from '../suite.config';

const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_MANDATORY_RULE.name;

test.describe(
  'MR-E2E-MM-10: Workflow Persistence',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    test(
      'Admin create rule -> Requestor submit CR with matching source -> verify asterisk persists post-SUBMITTED -> Cancel CR',
      { tag: ['@admin', '@workflow', '@happy-path', '@TC-11'] },
      async ({ browser }) => {
        test.setTimeout(300000);
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
        const adminMR = new AdminMandatoryRulePage(adminPage);
        const mainMR = new MainMandatoryRuleVerifyPage(requestorPage);
        const myRequest = new MyRequestPage(requestorPage);

        try {
          logPhase('PHASE 1', 'ADMIN — Create Mandatory Rule');
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await loginAs(
            requestorPage,
            suiteConfig.accounts.requestor.user,
            suiteConfig.accounts.requestor.pass
          );
          await adminMR.navigateToMandatoryRule(TEMPLATE_NAME);
          await adminMR.safeDeleteRule('weightUnit');
          await adminMR.createRuleBySourceField(
            'BASICGENERAL',
            'productOldID',
            'BASICDIMENSION',
            'weightUnit',
            '12345'
          );
          await adminMR.verifyToast('Business Rule Created');

          logPhase('PHASE 2', 'REQUESTOR — Create CR, fill source=12345, verify mandatory, submit');
          await openCopyRequestAndFillHeader(
            myRequest,
            suiteConfig.sourceCRs.default,
            'MR-10: Workflow Persistence [AUTO]',
            'Medium'
          );
          await mainMR.navigateToTargetArea('Basic Data');
          await mainMR.fillInputByLabel('Old Material Number', '12345', { pressEnter: true });
          await mainMR.navigateToTargetArea('Dimensions/EANs');
          await mainMR.verifyMandatoryAsterisk('Weight Unit');
          const newCR = await submitCRWithConfirm(
            requestorPage,
            'Requestor has submitted this request'
          );

          logPhase('PHASE 3', 'REQUESTOR — Wait for SUBMITTED');
          await myRequest.goto();
          const searchField = myRequest.page.getByRoleUI5('SearchField').first();
          await waitForCRStatus(requestorPage, searchField, newCR, 'SUBMITTED', 180000);

          logPhase('PHASE 4', 'REQUESTOR — Verify asterisk persists in CR detail');
          await myRequest.openCRDetail(newCR);
          await mainMR.navigateToTargetArea('Dimensions/EANs');
          await mainMR.verifyMandatoryAsterisk('Weight Unit');

          logPhase('PHASE 5', 'REQUESTOR — Cancel CR in My Request');
          await myRequest.cancelCR(newCR);

          logPhase('CLEANUP', 'Delete created rule');
          await adminMR.safeDeleteRule('weightUnit');
        } finally {
          await adminMR.safeDeleteRule('weightUnit');
        }
      }
    );
  }
);
