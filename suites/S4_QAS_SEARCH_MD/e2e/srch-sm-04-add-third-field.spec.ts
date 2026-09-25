import { test } from '@playwright/test';
import { generateMMTimestamp } from '../../../helpers/data';
import { loginAs } from '../../../helpers/auth';
import {
  adminConfigSearchMethod,
  adminConfigSearchResult,
  adminDeleteSearchMethod,
  mainSearchAndVerify,
} from '../../../helpers/search';
import { suiteConfig, getTestData, getMethodId } from '../suite.config';

const TD = getTestData('srch-sm-04');
const timestamp = generateMMTimestamp();
const methodId = getMethodId(TD.methodId);
const methodName = `${TD.methodName}_${timestamp}`;

test.describe(
  'SRCH-SM-04: Add 3rd Field - Add ProductPlant field',
  { tag: ['@search-md', '@bp:search-master-data'] },
  () => {
    test(
      'TC04 : Admin config method → add 3rd field → Main search verifies all columns',
      { tag: ['@admin', '@happy-path', '@TC-03'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        console.log('\n============================================');
        console.log('  SRCH-SM-04: ADD 3RD FIELD');
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
          console.log('  PHASE 1: ADMIN  -  Create method + 3 fields + 4 result fields');
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
          await adminConfigSearchResult(adminPage, methodId, methodName, [
            ...TD.resultFields,
            TD.extraResultField,
          ]);

          console.log(
            '\n[OK] PHASE 1 COMPLETE  -  Method + 3 fields + 4 result fields configured\n'
          );

          console.log('============================================');
          console.log('  PHASE 2: MAIN SEARCH  -  Verify all 4 columns');
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
          console.log(`[OK] SRCH-SM-04 PASSED`);
          console.log(`   Method ID: ${methodId}`);
          console.log(`   Flow: ADD (3 fields) → RESULT FIELDS (4) → SEARCH → DELETE`);
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
