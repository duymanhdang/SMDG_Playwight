import { test, expect } from '@playwright/test';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../../pages/cr/CopyRequestForm';
import { AdminPage } from '../../../pages/admin/AdminPage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData } from '../suite.config';
import { createAdminActions } from '../../../pages/actions/AdminActions';
import { resetAdminConfigBestEffort } from '../../../helpers/config/resetConfig';

/**
 * E2E-TC12: Admin Config - System Approve + System Activate (Fully Automated)
 * Suite: S4_QAS_AUTO_BP01
 *
 * Skills used:
 *   - admin/config-autoapprove.md
 *   - admin/config-autoactivate.md
 *   - copy.md
 *   - verify-status.md
 *   - admin/reset-config.md
 *
 * Flow:
 *   [Admin] Enable autoApprove + autoActivate -> save config
 *   [Requestor] Copy CR -> Submit -> verify ACTIVATED (no approver, no steward)
 *   [Admin] Reset both to false
 *
 * Multi-context: 2 browser contexts (admin, requestor)
 */

const TD = getTestData('e2e-bp-12');

const RESET_CONFIG = { templateName: 'AUTO_BP01', conditionId: 'AUTOBP01' };

test.describe(
  'E2E-BP-12: Admin Config - System Approve + System Activate',
  { tag: ['@cr', '@bp', '@bp:bp-cr-lifecycle'] },
  () => {
    test(
      'Full flow: Config auto -> Submit -> Verify ACTIVATED (fully automated)',
      { tag: ['@workflow', '@happy-path', '@TC-12'] },
      async ({ browser }) => {
        test.setTimeout(600000); // 10 minutes

        // Setup: 2 contexts
        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

        const adminPage = await adminCtx.newPage();
        const requestorPage = await requestorCtx.newPage();

        // Label pages
        await adminPage.evaluate(() => {
          document.title = '[ADMIN] SimpleMDG';
        });
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR] SimpleMDG';
        });

        // Page Objects
        const admin = new AdminPage(adminPage);
        const myRequest = new MyRequestPage(requestorPage);
        const form = new CopyRequestForm(requestorPage);

        // Action Classes
        const adminActions = createAdminActions(adminPage);

        let newCR = '';

        await admin.loginAs(suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
        await resetAdminConfigBestEffort(
          adminPage,
          admin,
          adminActions,
          RESET_CONFIG,
          'defensive reset'
        );

        try {
          // PHASE 1: ADMIN - Enable System Approve + System Activate
          console.log('\n========================================');
          console.log('  PHASE 1: ADMIN - Enable Auto Config');
          console.log('========================================');

          // Login as Admin
          console.log('[Test] Starting admin login...');
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          console.log('[Admin] Logged in successfully');
          console.log(`[Admin] Current URL: ${adminPage.url()}`);

          // Navigate to Process Designer and search template
          console.log('[Test] Clicking Process Designer...');
          await adminPage.getByText('Process Designer', { exact: true }).click();
          await adminPage.waitForTimeout(5000);

          console.log('[Test] Searching for template...');
          await admin.searchTemplate('AUTO_BP01');
          await admin.openTemplate('AUTO_BP01');

          // Enable System Approve
          await admin.gotoWorkflowSettings();
          await admin.gotoConditionSettings();
          await admin.searchConditionTable('AUTOBP01');
          await admin.clickEditConditionTable();
          await adminActions.enableSystemApprove();
          await admin.navigateBack();
          await adminPage.waitForTimeout(2000);

          // Enable System Activate
          await admin.gotoTemplateSettings();
          await adminActions.enableSystemActivate();
          await admin.saveTemplate();
          await admin.activateTemplate();

          console.log('\n✅ PHASE 1 COMPLETE - Auto Approve + Auto Activate enabled');

          // PHASE 2: REQUESTOR - Copy CR + Submit -> Verify ACTIVATED
          console.log('\n========================================');
          console.log('  PHASE 2: REQUESTOR - Copy CR & Submit');
          console.log('========================================');

          await myRequest.login();
          await myRequest.goto();
          await myRequest.openCopyRequest(suiteConfig.sourceCRs.default);

          await myRequest.fillHeader({
            description: TD.description,
            priority: TD.priority,
            //reason: TD.reason,
            notes: TD.notes,
          });
          await form.selectTemplate(suiteConfig.templates.AUTO_BP01.key, TD.templateName);

          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);

          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterSubmit);
          await myRequest.verifyBothStatuses(
            newCR,
            TD.expectedStatuses.afterSubmit,
            TD.expectedStatuses.activationStatus
          );

          console.log(`\n✅ PHASE 2 COMPLETE - CR ${newCR} -> ${TD.expectedStatuses.afterSubmit}`);

          // Summary
          console.log('\n========================================');
          console.log(`✅ E2E-TC12 PASSED`);
          console.log(`   CR: ${newCR}`);
          console.log(`   Flow: CONFIG AUTO -> SUBMIT -> ACTIVATED (fully automated)`);
          console.log('========================================');
        } finally {
          await resetAdminConfigBestEffort(
            adminPage,
            admin,
            adminActions,
            RESET_CONFIG,
            'finally reset'
          );
          console.log('\n[Cleanup] Closing all contexts...');
          await adminCtx.close();
          await requestorCtx.close();
          console.log('[Cleanup] ✅ All contexts closed');
        }
      }
    );
  }
);
