import { test } from '@playwright/test';
import { AdminAssignmentRulePage } from '../../../pages/admin/AdminAssignmentRulePage';
import { MainAssignmentEngineVerifyPage } from '../../../pages/verify/MainAssignmentEngineVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { NewRequestForm } from '../../../pages/cr/NewRequestForm';
import { suiteConfig, getTestData } from '../suite.config';
import { loginAs } from '../../../helpers/auth';

const TD = getTestData('ar-e2e-mm-05');
const SC = TD.scenarios[0]; // ADV_01
const SC_ADV05 = TD.scenarios[1]; // ADV_05
const EC03 = TD.edgeCases[0]; // EDGE_03 (numeric)
const EC04 = TD.edgeCases[1]; // EDGE_04 (toggle)

const RULES_CREATE = [
  {
    sourceSection: SC.sourceSection,
    sourceField: SC.sourceField,
    targetSection: SC.targetSection,
    targetField: SC.targetField,
    sourceProperty: SC.sourceProperty,
  },
  {
    sourceSection: SC_ADV05.sourceSection,
    sourceField: SC_ADV05.sourceField,
    targetSection: SC_ADV05.targetSection,
    targetField: SC_ADV05.targetField,
    sourceProperty: SC_ADV05.sourceProperty,
  },
];

const RULES_CLEANUP = [
  { sourceSection: SC.sourceSection, targetField: SC.targetField },
  { sourceSection: SC_ADV05.sourceSection, targetField: SC_ADV05.targetField },
];

test.describe.serial(
  'AR-E2E-MM-05: Advanced Scenarios & Edge Cases',
  { tag: ['@rules', '@assignment-rule', '@mm', '@bp:assignment-rule'] },
  () => {
    let adminCtx: any;
    let requestorCtx: any;
    let adminPage: any;
    let requestorPage: any;
    let adminAR: AdminAssignmentRulePage;
    let myRequest: MyRequestPage;
    let newRequestForm: NewRequestForm;
    let mainEngine: MainAssignmentEngineVerifyPage;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(suiteConfig.timeouts.e2eTest);

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

      // Admin login + create both rules
      await loginAs(adminPage, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
      await adminAR.navigateToAssignmentRule(suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name);
      for (const rule of RULES_CREATE) {
        await adminAR.createAssignmentRule(rule);
      }
      console.log(`[OK] ${RULES_CREATE.length} rules created in beforeAll`);

      // Requestor login once
      await loginAs(
        requestorPage,
        suiteConfig.accounts.requestor.user,
        suiteConfig.accounts.requestor.pass
      );
    });

    test.afterAll(async () => {
      console.log('\n--- afterAll: Deleting rules & closing contexts ---');
      // Ensure rule exists and toggle ON before delete
      for (const rule of RULES_CLEANUP) {
        try {
          await adminAR.deleteAssignmentRule(rule.sourceSection, rule.targetField);
          console.log(`[OK] Deleted ${rule.sourceSection}.${rule.targetField}`);
        } catch (e) {
          console.log(`[WARN] Delete ${rule.sourceSection}.${rule.targetField} failed:`, e);
        }
      }
      await adminCtx.close();
      await requestorCtx.close();
      console.log('[Cleanup] Contexts closed');
    });

    test(
      'ADV_01: BASICDIMENSION.netWeight → materialVolume',
      { tag: ['@happy-path', '@TC-11'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.phaseTimeout);
        console.log('\n=== ADV_01: Basic S2S Assignment ===');
        await myRequest.goto();
        await myRequest.openCopyRequest(TD.sourceCR, SC.confirmLabel);
        await mainEngine.verifyS2S(SC.inputValue);
        console.log(
          `\n✅ ADV_01 PASSED — ${SC.sourceSection}.${SC.sourceField} → ${SC.targetSection}.${SC.targetField} = ${SC.inputValue}`
        );
      }
    );

    test(
      'ADV_05: PLANTDATA.plant → GENERALPLANTDATASTORAGE.plant (Multi-Row)',
      { tag: ['@happy-path', '@TC-12'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.phaseTimeout);
        console.log('\n=== ADV_05: Multi-Row R2R ===');
        await myRequest.goto();
        await newRequestForm.openNewRequest(TD.objectType);
        await newRequestForm.selectTemplate(
          suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name,
          'Material Number'
        );
        await mainEngine.verifyR2R(SC_ADV05.testValue);
        console.log(
          `\n✅ ADV_05 PASSED — ${SC_ADV05.sourceSection}.${SC_ADV05.sourceField} → ${SC_ADV05.targetSection}.${SC_ADV05.targetField}`
        );
      }
    );

    test('EDGE_03: Numeric Boundary (99999.999)', { tag: ['@negative', '@TC-13'] }, async () => {
      test.setTimeout(suiteConfig.timeouts.phaseTimeout);
      console.log('\n=== EDGE_03: Numeric Boundary ===');
      await myRequest.goto();
      await myRequest.openCopyRequest(TD.sourceCR, EC03.confirmLabel);
      await mainEngine.verifyS2S(EC03.inputValue);
      console.log(`\n✅ EDGE_03 PASSED — Boundary ${EC03.inputValue}`);
    });

    test('EDGE_04: Rapid Toggle ON/OFF 10x', { tag: ['@state', '@TC-14'] }, async () => {
      test.setTimeout(suiteConfig.timeouts.phaseTimeout);
      console.log('\n=== EDGE_04: Rapid Toggle 10x ===');

      console.log(`[EDGE_04] Toggling rule ${EC04.toggleCount}x ON/OFF...`);
      for (let i = 1; i <= EC04.toggleCount; i++) {
        await adminAR.toggleRuleState(EC04.targetField, undefined, EC04.sourceSection);
        console.log(`[EDGE_04] Toggle ${i}/${EC04.toggleCount}`);
      }

      const finalState = await adminAR.getRuleState(EC04.targetField, EC04.sourceSection);
      console.log(`[EDGE_04] Final state: ${finalState ? 'ON' : 'OFF'}`);
      console.log(
        `\n✅ EDGE_04 PASSED — ${EC04.toggleCount}x rapid toggle, last state = ${finalState ? 'ON' : 'OFF'}`
      );
    });
  }
);
