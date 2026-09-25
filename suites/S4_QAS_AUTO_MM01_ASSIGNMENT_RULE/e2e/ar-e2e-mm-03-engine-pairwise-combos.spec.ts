import { test } from '@playwright/test';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { NewRequestForm } from '../../../pages/cr/NewRequestForm';
import { MainAssignmentEngineVerifyPage } from '../../../pages/verify/MainAssignmentEngineVerifyPage';
import { AdminAssignmentRulePage } from '../../../pages/admin/AdminAssignmentRulePage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData } from '../suite.config';

const TD = getTestData('ar-e2e-mm-03');

const pairS2S = TD.pairs.find((p: any) => p.id === 'PAIR_S2S');
const pairS2R = TD.pairs.find((p: any) => p.id === 'PAIR_S2R');
const pairR2S = TD.pairs.find((p: any) => p.id === 'PAIR_R2S');
const pairR2R = TD.pairs.find((p: any) => p.id === 'PAIR_R2R');
const loadScenario = TD.additionalScenarios.find((s: any) => s.id === 'DEFAULT_LOAD');
const changeScenario = TD.additionalScenarios.find((s: any) => s.id === 'DEFAULT_CHANGE');

/** Rules to create before verify, then delete after verify */
const CLEANUP_RULES = [
  { sourceSection: 'BASICDIMENSION', targetField: 'materialVolume' },
  { sourceSection: 'BASICGENERAL', targetField: 'alternativeUnit' },
  // PLANTDATA: serialNumberProfile first (unique), then plant (after serialNumberProfile removed)
  { sourceSection: 'PLANTDATA', targetField: 'serialNumberProfile' },
  { sourceSection: 'PLANTDATA', targetField: 'plant' },
  { sourceSection: 'UNITSOFMEASURE', targetField: 'unitSpecificProductHeight' },
  { sourceSection: 'ACCOUNTINGANDCOSTING', targetField: 'productPriceControl' },
];

const CREATE_RULES = [
  {
    sourceSection: pairS2S.sourceSection,
    sourceField: pairS2S.sourceField,
    targetSection: pairS2S.targetSection,
    targetField: pairS2S.targetField,
    sourceProperty: pairS2S.sourceProperty,
  },
  {
    sourceSection: pairS2R.sourceSection,
    sourceField: pairS2R.sourceField,
    targetSection: pairS2R.targetSection,
    targetField: pairS2R.targetField,
    sourceProperty: pairS2R.sourceProperty,
  },
  {
    sourceSection: pairR2S.sourceSection,
    sourceField: pairR2S.sourceField,
    targetSection: pairR2S.targetSection,
    targetField: pairR2S.targetField,
    sourceProperty: pairR2S.sourceProperty,
  },
  {
    sourceSection: pairR2R.sourceSection,
    sourceField: pairR2R.sourceField,
    targetSection: pairR2R.targetSection,
    targetField: pairR2R.targetField,
    sourceProperty: pairR2R.sourceProperty,
  },
  {
    sourceSection: loadScenario.sourceSection,
    sourceField: loadScenario.sourceField,
    targetSection: loadScenario.targetSection,
    targetField: loadScenario.targetField,
    sourceProperty: loadScenario.sourceProperty,
  },
  {
    sourceSection: changeScenario.sourceSection,
    sourceField: changeScenario.sourceField,
    targetSection: changeScenario.targetSection,
    targetField: changeScenario.targetField,
    sourceProperty: changeScenario.sourceProperty,
  },
];

test.describe.serial(
  'AR-E2E-MM-03: Main - Assignment Engine - Section Type Combinations (Pairwise)',
  { tag: ['@rules', '@assignment-rule', '@mm', '@bp:assignment-rule'] },
  () => {
    test(
      'Admin Create 6 Rules → Main Verify → Admin Cleanup',
      { tag: ['@admin', '@happy-path', '@TC-07'] },
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

        const adminAR = new AdminAssignmentRulePage(adminPage);
        const myRequest = new MyRequestPage(requestorPage);
        const newRequestForm = new NewRequestForm(requestorPage);
        const mainEngine = new MainAssignmentEngineVerifyPage(requestorPage);

        try {
          // ═══════════════════════════════════════════════════════════
          //  PHASE 1: ADMIN  -  Create 6 Rules
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 1: ADMIN  -  Create 6 Assignment Rules');
          console.log('======================================');

          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminAR.navigateToAssignmentRule(
            suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name
          );

          for (const rule of CREATE_RULES) {
            await adminAR.createAssignmentRule(rule);
          }

          console.log(`\n-- [OK] PHASE 1 COMPLETE  -  ${CREATE_RULES.length} rules created --`);

          // ═══════════════════════════════════════════════════════════
          //  PHASE 2: REQUESTOR  -  Verify 6 Rules in Main
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 2: REQUESTOR  -  Verify 6 Rules');
          console.log('======================================');

          await myRequest.login();
          await myRequest.goto();
          await newRequestForm.openNewRequest(TD.objectType);
          await newRequestForm.selectTemplate(
            suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name,
            'Material Number'
          );

          await mainEngine.verifyAll6(
            pairS2S,
            pairS2R,
            pairR2S,
            pairR2R,
            loadScenario,
            changeScenario
          );

          console.log('\n-- [OK] PHASE 2 COMPLETE  -  All 6 rules verified --');

          console.log('\n======================================');
          console.log('[OK] AUTO-03 PASSED');
          for (let i = 0; i < CREATE_RULES.length; i++) {
            console.log(
              '  Rule ' +
                (i + 1) +
                ': ' +
                CREATE_RULES[i].sourceSection +
                '.' +
                CREATE_RULES[i].sourceField +
                ' → ' +
                CREATE_RULES[i].targetSection +
                '.' +
                CREATE_RULES[i].targetField
            );
          }
          console.log('======================================');
        } finally {
          console.log('\n======================================');
          console.log('  CLEANUP: ADMIN  -  Delete Assignment Rules');
          console.log('======================================');
          try {
            for (const rule of CLEANUP_RULES) {
              await adminAR.deleteAssignmentRule(rule.sourceSection, rule.targetField);
            }
            console.log(`\n-- [OK] CLEANUP COMPLETE  -  ${CLEANUP_RULES.length} rules deleted --`);
          } catch (e) {
            console.log('[Cleanup] Error during rule cleanup:', (e as Error).message);
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
