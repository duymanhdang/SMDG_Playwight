import { test } from '@playwright/test';
import { generateMMTimestamp } from '../../../helpers/data';
import { loginAs } from '../../../helpers/auth';
import {
  adminConfigSearchMethod,
  adminConfigSearchResult,
  adminDeleteSearchMethod,
} from '../../../helpers/search';
import { AdminSearchMethodPage } from '../../../pages/admin/AdminSearchMethodPage';
import { MainSearchPage } from '../../../pages/search/MainSearchPage';
import { suiteConfig, getTestData, getMethodId } from '../suite.config';

const TD = getTestData('srch-sm-10');
const timestamp = generateMMTimestamp();
const methodId = getMethodId(TD.methodId);
const methodName = `${TD.methodName}_${timestamp}`;

test.describe(
  'SRCH-SM-10: Reorder Result Fields - Change field index order',
  { tag: ['@search-md', '@bp:search-master-data'] },
  () => {
    test(
      'TC10 : Admin config method → add result fields → reorder → Main search verifies new order',
      { tag: ['@admin', '@happy-path', '@TC-09'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        console.log('\n============================================');
        console.log('  SRCH-SM-10: REORDER RESULT FIELDS');
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
          console.log('  PHASE 1: ADMIN  -  Search Method Settings');
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

          // ============================================
          // PHASE 1b: ADMIN — Reorder search fields
          // ============================================
          console.log('============================================');
          console.log('  PHASE 1b: ADMIN  -  Reorder fields (set Field Index)');
          console.log('============================================');

          const methodPage = new AdminSearchMethodPage(adminPage);
          await methodPage.clickEditFields();

          for (const rf of TD.reorderFields) {
            await methodPage.changeFieldIndex(rf.field, rf.newIndex);
          }

          await methodPage.saveSearchMethodSettings();

          console.log('\n[OK] PHASE 1b COMPLETE  -  Fields reordered\n');

          console.log('============================================');
          console.log('  PHASE 2: ADMIN  -  Search Result Settings');
          console.log('============================================');

          await adminConfigSearchResult(adminPage, methodId, methodName, TD.resultFields);

          console.log('\n[OK] PHASE 2 COMPLETE  -  Result fields added\n');

          // ============================================
          // PHASE 3: MAIN SEARCH — Verify new column order
          // ============================================
          console.log('============================================');
          console.log('  PHASE 3: MAIN SEARCH  -  Verify new column order');
          console.log('============================================');

          await loginAs(
            requestorPage,
            suiteConfig.accounts.main.user,
            suiteConfig.accounts.main.pass
          );
          const mainPage = new MainSearchPage(requestorPage);
          await mainPage.gotoMasterDataTab();
          await mainPage.selectObjectType('Product');
          await mainPage.selectSearchMethod(methodName);
          for (const label of TD.searchFieldLabels) {
            await mainPage.verifyFieldLabel(label);
          }
          for (const fo of TD.fieldOperators) {
            await mainPage.verifyFieldOperators(fo.label, fo.operators);
          }
          // Fill search value into Product field by label (field order changed after reorder)
          await mainPage.fillSearchFieldValue('Product', TD.searchValue);
          await mainPage.clickSearch();
          for (const col of TD.mainVerifyColumns) {
            await mainPage.verifyResultColumn(col.label, col.nth);
          }

          console.log('\n[OK] PHASE 3 COMPLETE  -  Column order verified\n');

          // ============================================
          // CLEANUP
          // ============================================
          console.log('============================================');
          console.log('  CLEANUP  -  Delete search method');
          console.log('============================================');

          await adminDeleteSearchMethod(adminPage, methodId, methodName);
          methodDeleted = true;

          console.log('\n============================================');
          console.log(`[OK] SRCH-SM-10 PASSED`);
          console.log(`   Method ID: ${methodId}`);
          console.log(`   Flow: ADD → REORDER → RESULTS → SEARCH (verify order) → DELETE`);
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
