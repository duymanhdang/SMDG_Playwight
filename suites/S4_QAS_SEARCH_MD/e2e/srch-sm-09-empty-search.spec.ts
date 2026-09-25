import { test } from '@playwright/test';
import { generateMMTimestamp } from '../../../helpers/data';
import { loginAs } from '../../../helpers/auth';
import {
  adminConfigSearchMethod,
  adminConfigSearchResult,
  adminDeleteSearchMethod,
} from '../../../helpers/search';
import { MainSearchPage } from '../../../pages/search/MainSearchPage';
import { suiteConfig, getTestData, getMethodId } from '../suite.config';

const TD = getTestData('srch-sm-09');
const timestamp = generateMMTimestamp();
const methodId = getMethodId(TD.methodId);
const methodName = `${TD.methodName}_${timestamp}`;

test.describe(
  'SRCH-SM-09: Empty Search Criteria - Search without filling any field shows error dialog',
  { tag: ['@search-md', '@bp:search-master-data'] },
  () => {
    test(
      'TC09 : Admin config method → Main search with empty criteria → Error dialog',
      { tag: ['@admin', '@negative', '@TC-08'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        console.log('\n============================================');
        console.log('  SRCH-SM-09: EMPTY SEARCH CRITERIA');
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
          await adminConfigSearchResult(adminPage, methodId, methodName, TD.resultFields);

          console.log('\n[OK] PHASE 1 COMPLETE  -  Method + Fields + Results configured\n');

          console.log('============================================');
          console.log('  PHASE 2: MAIN SEARCH  -  Empty criteria → Error');
          console.log('============================================');

          await loginAs(
            requestorPage,
            suiteConfig.accounts.main.user,
            suiteConfig.accounts.main.pass
          );
          const searchPage = new MainSearchPage(requestorPage);

          await searchPage.gotoMasterDataTab();
          await searchPage.selectObjectType('Product');
          await searchPage.selectSearchMethod(methodName);

          // Verify field labels
          for (const label of TD.searchFieldLabels) {
            await searchPage.verifyFieldLabel(label);
          }

          // Click Search without filling any value
          await searchPage.clickSearch();

          // Verify error dialog appears
          await searchPage.verifySearchError(TD.expectedErrorMessage);

          // Close the error dialog
          await searchPage.closeErrorDialog();

          console.log('\n[OK] PHASE 2 COMPLETE  -  Error dialog verified and closed\n');

          console.log('============================================');
          console.log('  CLEANUP  -  Delete search method');
          console.log('============================================');

          await adminDeleteSearchMethod(adminPage, methodId, methodName);
          methodDeleted = true;

          console.log('\n============================================');
          console.log(`[OK] SRCH-SM-09 PASSED`);
          console.log(`   Method ID: ${methodId}`);
          console.log(`   Flow: ADD → RESULTS → EMPTY SEARCH → ERROR DIALOG → DELETE`);
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
