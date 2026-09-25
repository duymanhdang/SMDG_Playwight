import { test } from '@playwright/test';
import { AdminAssignmentRulePage } from '../../../pages/admin/AdminAssignmentRulePage';
import { MainAssignmentEngineVerifyPage } from '../../../pages/verify/MainAssignmentEngineVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { suiteConfig, getTestData } from '../suite.config';
import { loginAs } from '../../../helpers/auth';

const TD = getTestData('ar-e2e-mm-06');

test.describe(
  'AR-E2E-MM-06: E2E BASICDIMENSION.netWeight → materialVolume',
  { tag: ['@rules', '@assignment-rule', '@mm', '@bp:assignment-rule'] },
  () => {
    test(
      'Admin: Create Rule → Requestor: Verify Assignment → Admin: Delete',
      { tag: ['@admin', '@happy-path', '@TC-15'] },
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
        const mainAR = new MainAssignmentEngineVerifyPage(requestorPage);
        const myRequest = new MyRequestPage(requestorPage);
        const rule = TD.adminRule;

        try {
          // ═══════════════════════════════════════════════════════════
          //  PHASE 1: ADMIN  -  Create Rule
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 1: ADMIN  -  Create Assignment Rule');
          console.log('======================================');

          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminAR.navigateToAssignmentRule(
            suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name
          );

          await adminAR.createAssignmentRule({
            sourceSection: rule.sourceSection,
            sourceField: rule.sourceField,
            targetSection: rule.targetSection,
            targetField: rule.targetField,
            sourceProperty: rule.sourceProperty,
          });

          console.log('[OK] PHASE 1 COMPLETE  -  Assignment Rule created');

          // ═══════════════════════════════════════════════════════════
          //  PHASE 2: REQUESTOR  -  Verify Assignment Rule
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 2: REQUESTOR  -  Verify Assignment Rule');
          console.log('======================================');

          await loginAs(
            requestorPage,
            suiteConfig.accounts.requestor.user,
            suiteConfig.accounts.requestor.pass
          );
          await myRequest.goto();

          // Copy CR → Fill header → Verify assignment → Submit
          await myRequest.openCopyRequest(TD.sourceCR, TD.confirmLabel);
          await mainAR.verifyS2S(TD.mainInputValue);

          console.log('[OK] PHASE 2 COMPLETE  -  Assignment Rule verified');

          // ═══════════════════════════════════════════════════════════
          //  PHASE 3: ADMIN  -  Delete Rule (cleanup)
          // ═══════════════════════════════════════════════════════════
          console.log('\n======================================');
          console.log('  PHASE 3: ADMIN  -  Delete Assignment Rule (Cleanup)');
          console.log('======================================');

          await adminAR.deleteAssignmentRule(rule.sourceSection, rule.targetField);
          console.log('[OK] PHASE 3 COMPLETE  -  Test rule deleted');

          console.log('\n======================================');
          console.log('✅ [AR-E2E-MM-06] PASSED');
          console.log(
            `  Rule: ${rule.sourceSection}.${rule.sourceField} → ${rule.targetSection}.${rule.targetField}`
          );
          console.log(`  Verified: ${TD.mainInputValue} → ${TD.expectedAssignment}`);
          console.log('======================================');
        } finally {
          console.log('\nClose contexts');
          await adminCtx.close();
          await requestorCtx.close();
        }
      }
    );
  }
);
