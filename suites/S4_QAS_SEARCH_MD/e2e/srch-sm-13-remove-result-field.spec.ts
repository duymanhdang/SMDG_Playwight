import { test, expect } from '@playwright/test';
import { generateMMTimestamp } from '../../../helpers/data';
import { loginAs } from '../../../helpers/auth';
import {
  adminConfigSearchMethod,
  adminDeleteSearchMethod,
  mainSearchAndVerify,
} from '../../../helpers/search';
import { AdminSearchResultPage } from '../../../pages/admin/AdminSearchResultPage';
import { suiteConfig, getTestData, getMethodId } from '../suite.config';

const TD = getTestData('srch-sm-13');
const timestamp = generateMMTimestamp();
const methodId = getMethodId(TD.methodId);
const methodName = `${TD.methodName}_${timestamp}`;

test.describe(
  'SRCH-SM-13: Remove Result Field',
  { tag: ['@search-md', '@bp:search-master-data'] },
  () => {
    test(
      'TC13 : Add 3 result fields → remove 1 → verify remaining columns',
      { tag: ['@admin', '@happy-path', '@TC-12'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        console.log('\n============================================');
        console.log('  SRCH-SM-13: REMOVE RESULT FIELD');
        console.log(`  Method ID: ${methodId}`);
        console.log(`  Method Name: ${methodName}`);
        console.log('============================================\n');

        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const adminPage = await adminCtx.newPage();
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const requestorPage = await requestorCtx.newPage();

        let methodDeleted = false;

        try {
          console.log('============================================');
          console.log('  PHASE 1: ADMIN  -  Add Method + Field');
          console.log('============================================');

          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminConfigSearchMethod(
            adminPage,
            methodId,
            methodName,
            TD.templateName,
            TD.fieldConfigs
          );

          console.log('\n[OK] PHASE 1 COMPLETE  -  Method + Field configured\n');

          console.log('============================================');
          console.log('  PHASE 2: ADMIN  -  Search Result Settings (add + remove)');
          console.log('============================================');

          const resultPage = new AdminSearchResultPage(adminPage);
          await resultPage.gotoSearchResultSettings();
          await resultPage.searchMethod(methodId);
          await resultPage.selectMethodFromList(methodName);

          // Add 3 result fields
          for (const fieldName of TD.resultFields) {
            await resultPage.openValueHelp();
            await resultPage.searchFieldInValueHelp(fieldName);
            await resultPage.selectFirstRowInValueHelp(fieldName);
            await resultPage.saveAndCloseValueHelp();
            console.log(`[searchAdmin] ✓ Field ${fieldName} added`);
          }

          // Remove 1 result field
          await resultPage.removeResultField(TD.removeResultField);

          console.log('\n[OK] PHASE 2 COMPLETE  -  Result fields configured\n');

          // ============================================
          // PHASE 3: MAIN SEARCH
          // ============================================
          console.log('============================================');
          console.log('  PHASE 3: MAIN SEARCH');
          console.log('============================================');

          await loginAs(
            requestorPage,
            suiteConfig.accounts.main.user,
            suiteConfig.accounts.main.pass
          );
          await mainSearchAndVerify(
            requestorPage,
            'Product',
            methodName,
            TD.searchValue,
            TD.mainVerifyColumns,
            'ACTIVATED',
            TD.searchFieldLabels,
            TD.fieldOperators
          );

          // Verify removed column NOT visible
          console.log(`[MainSearchPage] Verifying hidden column: ${TD.hiddenResultField}`);
          await expect(
            requestorPage.getByRoleUI5('ColumnHeader', { name: TD.hiddenResultField }).first()
          ).not.toBeVisible({ timeout: 5000 });
          console.log(`[OK] Result field "${TD.hiddenResultField}" not displayed after removal`);

          console.log('\n[OK] PHASE 3 COMPLETE  -  Search + column verification passed\n');

          // ============================================
          // CLEANUP
          // ============================================
          console.log('============================================');
          console.log('  CLEANUP  -  Delete search method');
          console.log('============================================');

          await adminDeleteSearchMethod(adminPage, methodId, methodName);
          methodDeleted = true;

          console.log('\n============================================');
          console.log(`[OK] SRCH-SM-13 PASSED`);
          console.log(`   Method ID: ${methodId}`);
          console.log(`   Flow: CREATE → RESULTS (add 3, remove 1) → SEARCH → DELETE`);
          console.log('============================================\n');
        } finally {
          if (!methodDeleted) {
            console.log('\n[Cleanup] Attempting to delete search method (best-effort)...');
            try {
              await adminDeleteSearchMethod(adminPage, methodId, methodName);
              console.log('[Cleanup] [OK] Method deleted');
            } catch (err) {
              const msg = (err as Error).message?.split('\n')[0] ?? String(err);
              console.log(`[Cleanup] [WARN] Method deletion failed/skipped - ${msg}`);
            }
          }
          console.log('\n[Cleanup] Closing contexts...');
          await adminCtx.close();
          await requestorCtx.close();
          console.log('[Cleanup] [OK] All contexts closed');
        }
      }
    );
  }
);
