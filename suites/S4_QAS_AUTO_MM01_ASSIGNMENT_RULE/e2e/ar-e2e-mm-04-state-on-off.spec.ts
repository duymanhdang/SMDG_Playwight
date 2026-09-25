import { test, expect } from '@playwright/test';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { NewRequestForm } from '../../../pages/cr/NewRequestForm';
import { MainAssignmentEngineVerifyPage } from '../../../pages/verify/MainAssignmentEngineVerifyPage';
import { AdminAssignmentRulePage } from '../../../pages/admin/AdminAssignmentRulePage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData } from '../suite.config';

const TD = getTestData('ar-e2e-mm-04');
const rule = TD.rule;

test.describe(
  'AR-E2E-MM-04: Main - Rule State ON/OFF Verification (Boundary Testing)',
  { tag: ['@rules', '@assignment-rule', '@mm', '@bp:assignment-rule'] },
  () => {
    let adminCtx: any;
    let requestorCtx: any;
    let adminPage: any;
    let requestorPage: any;
    let adminAR: any;
    let myRequest: any;
    let newRequestForm: any;
    let mainEngine: any;

    test.beforeAll(async ({ browser }) => {
      adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

      adminPage = await adminCtx.newPage();
      requestorPage = await requestorCtx.newPage();

      await adminPage.evaluate(() => {
        document.title = '[ADMIN] SimpleMDG';
      });
      await requestorPage.evaluate(() => {
        document.title = '[REQUESTOR] SimpleMDG';
      });

      adminAR = new AdminAssignmentRulePage(adminPage);
      myRequest = new MyRequestPage(requestorPage);
      newRequestForm = new NewRequestForm(requestorPage);
      mainEngine = new MainAssignmentEngineVerifyPage(requestorPage);

      await loginAs(adminPage, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
      await adminAR.navigateToAssignmentRule(suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name);

      // Login requestor once
      await loginAs(
        requestorPage,
        suiteConfig.accounts.requestor.user,
        suiteConfig.accounts.requestor.pass
      );
      await myRequest.goto();

      console.log('\n======================================');
      console.log('  beforeAll: ADMIN Create Rule');
      console.log('======================================');
      await adminAR.createAssignmentRule({
        sourceSection: rule.sourceSection,
        sourceField: rule.sourceField,
        targetSection: rule.targetSection,
        targetField: rule.targetField,
        sourceProperty: rule.sourceProperty,
      });
      console.log('[OK] Rule created (state: ON)');
    });

    test.afterAll(async () => {
      console.log('\n======================================');
      console.log('  afterAll: ADMIN Delete Rule');
      console.log('======================================');
      try {
        await adminAR.deleteAssignmentRule(rule.sourceSection, rule.targetField);
        console.log('[OK] Rule deleted');
      } catch (e) {
        console.log('[WARN] Delete failed:', e);
      }
      await adminCtx.close();
      await requestorCtx.close();
      console.log('[Cleanup] Contexts closed');
    });

    // Step 1-2: Rule ON → netWeight=10.000 → Volume=10.000
    test('State: STATE_ON', { tag: ['@state', '@TC-08'] }, async () => {
      test.setTimeout(suiteConfig.timeouts.phaseTimeout);
      console.log('\n=== STATE TEST: STATE_ON ===');

      const currentState = await adminAR.getRuleState(rule.targetField);
      if (!currentState) {
        console.log('[Test] Rule is OFF, toggling to ON...');
        await adminAR.toggleRuleState(rule.targetField, true);
      }

      await myRequest.goto();
      await newRequestForm.openNewRequest(TD.objectType);
      await newRequestForm.selectTemplate(
        suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name,
        'Material Number'
      );

      await mainEngine.verifyS2S('10.000');
      console.log('[OK] State test STATE_ON passed');
    });

    // Step 3-4: Toggle OFF → netWeight=20.000 → Volume empty
    test('State: STATE_OFF', { tag: ['@state', '@TC-09'] }, async () => {
      test.setTimeout(suiteConfig.timeouts.phaseTimeout);
      console.log('\n=== STATE TEST: STATE_OFF ===');

      console.log('[Test] Toggling rule OFF...');
      await adminAR.toggleRuleState(rule.targetField, false);

      await myRequest.goto();
      await newRequestForm.openNewRequest(TD.objectType);
      await newRequestForm.selectTemplate(
        suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name,
        'Material Number'
      );

      console.log('[Test] Setting Net Weight = 20.000 (rule OFF)');
      await expect(requestorPage.getByRoleUI5('Label', { text: 'Net Weight' }).first()).toBeVisible(
        { timeout: 10000 }
      );
      await requestorPage
        .getByRoleUI5('Input', { placeholder: 'Number is allowed' })
        .nth(1)
        .click();
      await requestorPage
        .getByRoleUI5('Input', { placeholder: 'Number is allowed' })
        .nth(1)
        .fill('20.000');
      await requestorPage
        .getByRoleUI5('Input', { placeholder: 'Number is allowed' })
        .nth(1)
        .press('Enter');
      await requestorPage.waitForTimeout(3000);

      await expect(requestorPage.getByRoleUI5('Label', { text: 'Volume' }).first()).toBeVisible({
        timeout: 10000,
      });
      await requestorPage.waitForTimeout(1000);
      const matchCount = await requestorPage.getByRoleUI5('Input', { value: '20.000' }).count();
      expect(matchCount).toBe(1);
      console.log('[OK] State test STATE_OFF passed');
    });

    // Step 5-6: Toggle ON → netWeight=30 → Volume=30
    test('State: STATE_TOGGLE', { tag: ['@state', '@TC-10'] }, async () => {
      test.setTimeout(suiteConfig.timeouts.phaseTimeout);
      console.log('\n=== STATE TEST: STATE_TOGGLE ===');

      console.log('[Test] Toggling rule ON...');
      await adminAR.toggleRuleState(rule.targetField, true);

      await myRequest.goto();
      await newRequestForm.openNewRequest(TD.objectType);
      await newRequestForm.selectTemplate(
        suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name,
        'Material Number'
      );

      await mainEngine.verifyS2S('30.000');
      console.log('[OK] State test STATE_TOGGLE passed');
    });
  }
);
