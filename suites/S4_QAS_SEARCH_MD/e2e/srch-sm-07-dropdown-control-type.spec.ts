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

const TD = getTestData('srch-sm-07');
const timestamp = generateMMTimestamp();
const methodId = getMethodId(TD.methodId);
const methodName = `${TD.methodName}_${timestamp}`;

test.describe(
  'SRCH-SM-07: DROPDOWN Control Type - Configure language with DROPDOWN control and search by selecting EN',
  { tag: ['@search-md', '@bp:search-master-data'] },
  () => {
    test(
      'TC07 : Admin config DROPDOWN field → Main search with dropdown selection',
      { tag: ['@admin', '@happy-path', '@TC-06'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        console.log('\n============================================');
        console.log('  SRCH-SM-07: DROPDOWN CONTROL TYPE');
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
          // PHASE 1b: ADMIN — Edit Fields → Change to DROPDOWN
          // ============================================
          console.log('============================================');
          console.log('  PHASE 1b: ADMIN  -  Edit Fields → Change to DROPDOWN');
          console.log('============================================');

          await adminEditFieldControlTypes(
            adminPage,
            TD.editFieldConfigs.map((cfg: any) => ({
              ...cfg,
              dropdownSourceData: cfg.fieldName === 'language' ? TD.dropdownSourceData : undefined,
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
          // PHASE 3: MAIN SEARCH — Dropdown Select → Search
          // ============================================
          console.log('============================================');
          console.log('  PHASE 3: MAIN SEARCH  -  Dropdown Select Search');
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

          // Use dropdown to select search value 'EN'
          await searchPage.selectDropdownValue(TD.searchFieldLabels[0], TD.dropdownSearchValue);

          // Execute search
          await searchPage.clickSearch();

          // Verify result column headers
          for (const col of TD.mainVerifyColumns) {
            await searchPage.verifyResultColumn(col.label, col.nth);
          }

          console.log('\n[OK] PHASE 3 COMPLETE  -  Dropdown search verified\n');

          // ============================================
          // CLEANUP
          // ============================================
          console.log('============================================');
          console.log('  CLEANUP  -  Delete search method');
          console.log('============================================');

          await adminDeleteSearchMethod(adminPage, methodId, methodName);
          methodDeleted = true;

          console.log('\n============================================');
          console.log(`[OK] SRCH-SM-07 PASSED`);
          console.log(`   Method ID: ${methodId}`);
          console.log(`   Flow: ADD → EDIT DROPDOWN → RESULTS → DROPDOWN SEARCH → DELETE`);
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
