import { test } from '@playwright/test';
import { generateMMTimestamp } from '../../../helpers/data';
import { loginAs } from '../../../helpers/auth';
import {
  adminConfigSearchResult,
  adminDeleteSearchMethod,
  mainSearchAndVerify,
} from '../../../helpers/search';
import { AdminSearchMethodPage } from '../../../pages/admin/AdminSearchMethodPage';
import { suiteConfig, getTestData, getMethodId } from '../suite.config';

const TD = getTestData('srch-sm-11');
const timestamp = generateMMTimestamp();
const methodId = getMethodId(TD.methodId);
const methodName = `${TD.methodName}_${timestamp}`;

test.describe(
  'SRCH-SM-11: Cancel Add Method',
  { tag: ['@search-md', '@bp:search-master-data'] },
  () => {
    test(
      'TC11 : Admin cancel add method → verify not created → create normally → search → delete',
      { tag: ['@admin', '@negative', '@TC-10'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        console.log('\n============================================');
        console.log('  SRCH-SM-11: CANCEL ADD METHOD');
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
          console.log('  PHASE 1: ADMIN  -  Navigate to Search Method Settings');
          console.log('============================================');

          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          const methodPage = new AdminSearchMethodPage(adminPage);
          await methodPage.gotoSearchMethodSettings(TD.templateName);

          // ============================================
          // PHASE 1a: Cancel Add Method
          // ============================================
          console.log('============================================');
          console.log('  PHASE 1a: ADMIN  -  Cancel Add Method (should not create)');
          console.log('============================================');

          await methodPage.clickAddMethod();
          await methodPage.fillMethodDialog(methodId, methodName);
          await methodPage.cancelAddMethod();
          await methodPage.verifyMethodNotVisible(methodName);
          console.log('[OK] Method not created after cancel\n');

          // ============================================
          // PHASE 1b: Create Method for real (no re-navigate, already on page)
          // ============================================
          console.log('============================================');
          console.log('  PHASE 1b: ADMIN  -  Create Method + Fields (real)');
          console.log('============================================');

          await methodPage.clickAddMethod();
          await methodPage.fillMethodDialog(methodId, methodName);
          await methodPage.confirmAddMethod();
          await methodPage.verifyMethodById(methodId);
          await methodPage.verifyMethodInList(methodName);
          await methodPage.selectMethod(methodName);
          await methodPage.clickAddFields();

          for (const [i, fc] of TD.fieldConfigs.entries()) {
            if (i > 0) await methodPage.clickAddFields();
            await methodPage.selectBusinessTable(fc.businessTable);
            await methodPage.selectFieldFromTable(fc.fieldName);
            await methodPage.confirmAddField();
            await methodPage.verifyFieldInList(fc.fieldName);
            await methodPage.verifyControlType(fc.fieldName, fc.controlType);
          }

          console.log('\n[OK] PHASE 1 COMPLETE  -  Method + Fields configured\n');

          console.log('============================================');
          console.log('  PHASE 2: ADMIN  -  Search Result Settings');
          console.log('============================================');

          await adminConfigSearchResult(adminPage, methodId, methodName, TD.resultFields);

          console.log('\n[OK] PHASE 2 COMPLETE  -  Result fields added\n');

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

          console.log('\n[OK] PHASE 3 COMPLETE  -  Search verified\n');

          // ============================================
          // CLEANUP
          // ============================================
          console.log('============================================');
          console.log('  CLEANUP  -  Delete search method');
          console.log('============================================');

          await adminDeleteSearchMethod(adminPage, methodId, methodName);
          methodDeleted = true;

          console.log('\n============================================');
          console.log(`[OK] SRCH-SM-11 PASSED`);
          console.log(`   Method ID: ${methodId}`);
          console.log(`   Flow: CANCEL → CREATE → RESULTS → SEARCH → DELETE`);
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
