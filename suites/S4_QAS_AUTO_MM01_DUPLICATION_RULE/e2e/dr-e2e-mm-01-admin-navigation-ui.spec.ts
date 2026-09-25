import { test } from '@playwright/test';
import { AdminDuplicationRulePage } from '../../../pages/admin/AdminDuplicationRulePage';
import { loginAs } from '../../../helpers/auth';
import { logPhase } from '../../../helpers/utils';
import { suiteConfig, getTestData } from '../suite.config';

const TD = getTestData('dr-e2e-mm-01');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_DUPLICATION_RULE.name;

test.describe(
  'DR-E2E-MM-01: Admin Navigation & UI for Duplication Rule',
  { tag: ['@rules', '@duplication-rule', '@mm', '@bp:duplication-rule'] },
  () => {
    test(
      'Navigate to Duplication Rule page -> Verify UI elements -> Search -> Refresh',
      { tag: ['@admin', '@happy-path', '@TC-00'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const adminPage = await adminCtx.newPage();
        await adminPage.evaluate(() => {
          document.title = '[ADMIN]';
        });

        const adminDR = new AdminDuplicationRulePage(adminPage);

        try {
          logPhase(
            'TC-01',
            'ADMIN NAVIGATION & UI',
            'Flow: Login → Navigate → Verify UI → Refresh → Search'
          );

          console.log(
            `\n[1a] Admin login + navigate to Duplication Rule (template: ${TEMPLATE_NAME})`
          );
          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminDR.navigateToDuplicationRule(TEMPLATE_NAME);
          console.log('✅  Navigated to Duplication Rule page');

          console.log(`\n[2a] 🔍 Verify UI elements: page loaded`);
          await adminDR.verifyDuplicationRulePageLoaded();
          console.log(`[2b] 🔍 Verify Add New button`);
          await adminDR.verifyAddNewButtonVisible();
          console.log(`[2c] 🔍 Verify Search field`);
          await adminDR.verifySearchFieldVisible();
          console.log(`[2d] 🔍 Verify Rule table`);
          await adminDR.verifyRuleTableVisible();
          console.log(`[2e] 🔍 Verify Process Designer tab`);
          await adminDR.verifyProcessDesignerTabVisible();
          console.log('✅  All UI elements verified');

          console.log(`\n[3a] ➡️ Click Refresh`);
          await adminDR.clickRefresh();
          console.log('✅  Refresh clicked successfully — no errors');

          console.log(`\n[4a] 🔍 Search functionality`);
          if (process.env.HAS_DUPLICATION_RULES === 'true') {
            await adminDR.searchRuleBySourceSection('BASICDIMENSION');
            await adminDR.verifyRuleRowVisible();
            console.log('✅  Search returned existing rules');
          } else {
            console.log('⏭️  No rules to search — skipping search verification');
          }

          console.log('\n✅  TC-01: ADMIN NAVIGATION & UI — ALL CHECKS PASSED');
        } finally {
          // Note: context NOT closed here — Playwright manages cleanup on worker exit.
        }
      }
    );
  }
);
