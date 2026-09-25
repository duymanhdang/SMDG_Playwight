import { test } from '@playwright/test';
import { generateMMTimestamp } from '../../../helpers/data';
import { loginAs } from '../../../helpers/auth';
import {
  adminVerifyDuplicateAndCreateMethod,
  adminConfigSearchResult,
  adminDeleteSearchMethod,
  mainSearchAndVerify,
} from '../../../helpers/search';
import { suiteConfig, getTestData, getMethodId } from '../suite.config';

const TD = getTestData('srch-sm-05');
const timestamp = generateMMTimestamp();
const methodId = getMethodId(TD.methodId);
const methodName = `${TD.methodName}_${timestamp}`;

test.describe(
  'SRCH-SM-05: Duplicate Method ID + Multi-Table Fields',
  { tag: ['@search-md', '@bp:search-master-data'] },
  () => {
    test(
      'TC05 : Duplicate ID check → create method with 4 fields → Main search verifies all 5 columns',
      { tag: ['@admin', '@happy-path', '@TC-04'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        console.log('\n============================================');
        console.log('  SRCH-SM-05: DUPLICATE METHOD ID + MULTI-TABLE FIELDS');
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
          console.log('  PHASE 1: ADMIN  -  Duplicate check + create method + 4 fields');
          console.log('============================================');

          await loginAs(
            adminPage,
            suiteConfig.accounts.admin.user,
            suiteConfig.accounts.admin.pass
          );
          await adminVerifyDuplicateAndCreateMethod(
            adminPage,
            methodId,
            methodName,
            TD.templateName,
            TD.duplicateMethodId,
            TD.duplicateMethodName,
            TD.expectedErrorText,
            TD.fieldConfigs
          );
          await adminConfigSearchResult(adminPage, methodId, methodName, TD.resultFields);

          console.log(
            '\n[OK] PHASE 1 COMPLETE  -  Duplicate check + 4 fields + 5 result fields configured\n'
          );

          console.log('============================================');
          console.log('  PHASE 2: MAIN SEARCH  -  Verify all 5 columns');
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

          console.log('\n[OK] PHASE 2 COMPLETE  -  All columns verified\n');

          console.log('============================================');
          console.log('  CLEANUP  -  Delete search method');
          console.log('============================================');

          await adminDeleteSearchMethod(adminPage, methodId, methodName);
          methodDeleted = true;

          console.log('\n[OK] CLEANUP COMPLETE  -  Method deleted\n');

          console.log('============================================');
          console.log(`[OK] SRCH-SM-05 PASSED`);
          console.log(`   Method ID: ${methodId}`);
          console.log(
            `   Flow: DUPLICATE CHECK → ADD (4 fields) → RESULT FIELDS (5) → SEARCH → DELETE`
          );
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
