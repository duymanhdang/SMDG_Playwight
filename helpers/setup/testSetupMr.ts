import { Browser, BrowserContext, Page } from '@playwright/test';
import { AdminMandatoryRulePage } from '../../pages/admin/AdminMandatoryRulePage';
import { MainMandatoryRuleVerifyPage } from '../../pages/verify/MainMandatoryRuleVerifyPage';
import { MyRequestPage } from '../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../pages/cr/CopyRequestForm';
import { loginAs } from '../auth/login';
import { suiteConfig } from '../../suites/S4_QAS_AUTO_MM01_MANDATORY_RULE/suite.config';

export interface TestContext {
  adminPage: Page;
  requestorPage: Page;
  adminMR: AdminMandatoryRulePage;
  mainMR: MainMandatoryRuleVerifyPage;
  myRequest: MyRequestPage;
  form: CopyRequestForm;
}

export async function setupTestContext(browser: Browser): Promise<TestContext> {
  const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const adminPage = await adminCtx.newPage();
  const requestorPage = await requestorCtx.newPage();
  await adminPage.evaluate(() => { document.title = '[ADMIN]'; });
  await requestorPage.evaluate(() => { document.title = '[REQUESTOR]'; });
  return {
    adminPage,
    requestorPage,
    adminMR: new AdminMandatoryRulePage(adminPage),
    mainMR: new MainMandatoryRuleVerifyPage(requestorPage),
    myRequest: new MyRequestPage(requestorPage),
    form: new CopyRequestForm(requestorPage),
  };
}

export async function loginBoth(ctx: TestContext): Promise<void> {
  await loginAs(ctx.adminPage, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
  await loginAs(ctx.requestorPage, suiteConfig.accounts.requestor.user, suiteConfig.accounts.requestor.pass);
}
