import { test } from '@playwright/test';
import { generateMMTimestamp } from '../../../helpers/data';
import { loginAs } from '../../../helpers/auth';
import {
  adminConfigSearchMethod,
  adminConfigSearchResult,
  adminDeleteSearchMethod,
  mainSearchAndVerifyMultiField,
} from '../../../helpers/search';
import { suiteConfig, getTestData, getMethodId } from '../suite.config';

const TD = getTestData('srch-sm-12');
const timestamp = generateMMTimestamp();
const methodId = getMethodId(TD.methodId);
const methodName = `${TD.methodName}_${timestamp}`;

test.describe(
  'SRCH-SM-12: Multi-Field Search',
  { tag: ['@search-md', '@bp:search-master-data'] },
  () => {
    test(
      'TC12 : Fill multiple search criteria → verify combined results',
      { tag: ['@admin', '@happy-path', '@TC-11'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        console.log('\n============================================');
        console.log('  SRCH-SM-12: MULTI-FIELD SEARCH');
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
          console.log('  PHASE 1: ADMIN  -  Add Method + Fields');
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

          console.log('\n[OK] PHASE 1 COMPLETE  -  Method + Fields configured\n');

          console.log('============================================');
          console.log('  PHASE 2: ADMIN  -  Search Result Settings');
          console.log('============================================');

          await adminConfigSearchResult(adminPage, methodId, methodName, TD.resultFields);

          console.log('\n[OK] PHASE 2 COMPLETE  -  Result fields added\n');

          // ============================================
          // PHASE 3: MAIN SEARCH (Multi-Field)
          // ============================================
          console.log('============================================');
          console.log('  PHASE 3: MAIN SEARCH  -  Multi-Field');
          console.log('============================================');

          await loginAs(
            requestorPage,
            suiteConfig.accounts.main.user,
            suiteConfig.accounts.main.pass
          );
          await mainSearchAndVerifyMultiField(
            requestorPage,
            'Product',
            methodName,
            TD.searchFieldValues,
            TD.mainVerifyColumns,
            'ACTIVATED',
            TD.searchFieldLabels,
            TD.fieldOperators
          );

          console.log('\n[OK] PHASE 3 COMPLETE  -  Multi-field search verified\n');

          // ============================================
          // CLEANUP
          // ============================================
          console.log('============================================');
          console.log('  CLEANUP  -  Delete search method');
          console.log('============================================');

          await adminDeleteSearchMethod(adminPage, methodId, methodName);
          methodDeleted = true;

          console.log('\n============================================');
          console.log(`[OK] SRCH-SM-12 PASSED`);
          console.log(`   Method ID: ${methodId}`);
          console.log(`   Flow: CREATE → RESULTS → MULTI-FIELD SEARCH → DELETE`);
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
