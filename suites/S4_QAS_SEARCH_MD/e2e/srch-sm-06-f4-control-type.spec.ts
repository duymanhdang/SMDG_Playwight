import { test, expect } from '@playwright/test';
import { generateMMTimestamp } from '../../../helpers/data';
import { loginAs } from '../../../helpers/auth';
import {
  adminConfigSearchMethod,
  adminConfigSearchResult,
  adminEditFieldControlTypes,
  adminDeleteSearchMethod,
} from '../../../helpers/search';
import { MainSearchPage } from '../../../pages/search/MainSearchPage';
import { suiteConfig, getTestData, getMethodId } from '../suite.config';

const TD = getTestData('srch-sm-06');
const timestamp = generateMMTimestamp();
const methodId = getMethodId(TD.methodId);
const methodName = `${TD.methodName}_${timestamp}`;

test.describe(
  'SRCH-SM-06: F4 Control Type - Configure productType with F4 control and search via value help',
  { tag: ['@search-md', '@bp:search-master-data'] },
  () => {
    test(
      'TC06 : Admin config F4 field → Main search with value help',
      { tag: ['@admin', '@happy-path', '@TC-05'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        console.log('\n============================================');
        console.log('  SRCH-SM-06: F4 CONTROL TYPE');
        console.log(`  Method ID: ${methodId}`);
        console.log(`  Method Name: ${methodName}`);
        console.log('============================================\n');

        const adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const adminPage = await adminCtx.newPage();
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const requestorPage = await requestorCtx.newPage();

        let methodDeleted = false;

        try {
          // ============================================
          // PHASE 1: ADMIN — Add fields (TEXTBOX default)
          // ============================================
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

          console.log('\n[OK] PHASE 1 COMPLETE  -  Method + Fields configured\n');

          // ============================================
          // PHASE 1b: ADMIN — Edit Fields → Change to F4
          // ============================================
          console.log('============================================');
          console.log('  PHASE 1b: ADMIN  -  Edit Fields → Change to F4');
          console.log('============================================');

          await adminEditFieldControlTypes(
            adminPage,
            TD.editFieldConfigs.map((cfg: any) => ({
              ...cfg,
              f4SourceData: cfg.fieldName === 'productType' ? TD.f4SourceData : undefined,
            }))
          );

          console.log('\n[OK] PHASE 1b COMPLETE  -  Control types updated\n');

          // ============================================
          // PHASE 2: ADMIN — Search Result Settings
          // ============================================
          console.log('============================================');
          console.log('  PHASE 2: ADMIN  -  Search Result Settings');
          console.log('============================================');

          await adminConfigSearchResult(adminPage, methodId, methodName, TD.resultFields);

          console.log('\n[OK] PHASE 2 COMPLETE  -  Result fields configured\n');

          // ============================================
          // PHASE 3: MAIN SEARCH — F4 Value Help → Search
          // ============================================
          console.log('============================================');
          console.log('  PHASE 3: MAIN SEARCH  -  F4 Value Help Search');
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

          // Use F4 value help to select search value
          await searchPage.clickFieldValueHelp(TD.searchFieldLabels[0]);

          // In F4 dialog: search, select, confirm
          await searchPage.searchInF4Dialog(TD.f4SearchValue);
          await searchPage.selectFirstF4Item();

          // Execute search
          await searchPage.clickSearch();

          // Verify result column headers
          for (const col of TD.mainVerifyColumns) {
            await searchPage.verifyResultColumn(col.label, col.nth);
          }

          console.log('\n[OK] PHASE 3 COMPLETE  -  F4 search verified\n');

          // ============================================
          // CLEANUP
          // ============================================
          console.log('============================================');
          console.log('  CLEANUP  -  Delete search method');
          console.log('============================================');

          await adminDeleteSearchMethod(adminPage, methodId, methodName);
          methodDeleted = true;

          console.log('\n============================================');
          console.log(`[OK] SRCH-SM-06 PASSED`);
          console.log(`   Method ID: ${methodId}`);
          console.log(`   Flow: ADD → EDIT F4 → RESULTS → F4 SEARCH → DELETE`);
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
