import { Page, expect } from '@playwright/test';
import { MainSearchPage } from '../../pages/search/MainSearchPage';

interface ColumnVerify {
  label: string;
  nth?: number;
}

interface FieldOperators {
  label: string;
  operators: string[];
}

async function verifyFields(searchPage: MainSearchPage, fieldLabels?: string[], fieldOperators?: FieldOperators[]): Promise<void> {
  if (fieldLabels) {
    for (const label of fieldLabels) {
      await searchPage.verifyFieldLabel(label);
    }
  }
  if (fieldOperators) {
    for (const fo of fieldOperators) {
      await searchPage.verifyFieldOperators(fo.label, fo.operators);
    }
  }
}

export async function mainSearchAndVerify(
  page: Page,
  objectType: string,
  methodName: string,
  searchValue: string,
  verifyColumns: ColumnVerify[],
  expectedStatus: string,
  fieldLabels?: string[],
  fieldOperators?: FieldOperators[]
): Promise<void> {
  console.log(`[searchMain] Main Search: ${objectType} / ${methodName} = ${searchValue}`);
  const searchPage = new MainSearchPage(page);

  await searchPage.gotoMasterDataTab();
  await searchPage.selectObjectType(objectType);
  await searchPage.selectSearchMethod(methodName);

  await verifyFields(searchPage, fieldLabels, fieldOperators);

  await searchPage.fillSearchValue(searchValue);
  await searchPage.clickSearch();

  for (const col of verifyColumns) {
    await searchPage.verifyResultColumn(col.label, col.nth);
  }
  await searchPage.verifyResultValue(searchValue);
  await searchPage.verifyResultStatus(expectedStatus);

  console.log('[searchMain] Main search verification passed');
}

export async function mainSearchVerifyNoResults(
  page: Page,
  objectType: string,
  methodName: string,
  searchValue: string,
  fieldLabels?: string[],
  fieldOperators?: FieldOperators[]
): Promise<void> {
  console.log(`[searchMain] Main Search (No Results): ${objectType} / ${methodName} = ${searchValue}`);
  const searchPage = new MainSearchPage(page);

  await searchPage.gotoMasterDataTab();
  await searchPage.selectObjectType(objectType);
  await searchPage.selectSearchMethod(methodName);

  await verifyFields(searchPage, fieldLabels, fieldOperators);

  await searchPage.fillSearchValue(searchValue);
  await searchPage.clickSearch();
  await searchPage.verifyNoResults();

  console.log('[searchMain] No results verification passed');
}

interface SearchFieldValue {
  label: string;
  value: string;
}

export async function mainSearchAndVerifyMultiField(
  page: Page,
  objectType: string,
  methodName: string,
  searchFieldValues: SearchFieldValue[],
  verifyColumns: ColumnVerify[],
  expectedStatus: string,
  fieldLabels?: string[],
  fieldOperators?: FieldOperators[]
): Promise<void> {
  console.log(`[searchMain] Multi-Field Search: ${objectType} / ${methodName}`);
  const searchPage = new MainSearchPage(page);

  await searchPage.gotoMasterDataTab();
  await searchPage.selectObjectType(objectType);
  await searchPage.selectSearchMethod(methodName);

  await verifyFields(searchPage, fieldLabels, fieldOperators);

  for (const sfv of searchFieldValues) {
    if (sfv.value) {
      await searchPage.fillSearchFieldValue(sfv.label, sfv.value);
    }
  }
  await searchPage.clickSearch();

  for (const col of verifyColumns) {
    await searchPage.verifyResultColumn(col.label, col.nth);
  }
  if (searchFieldValues.length > 0) {
    await searchPage.verifyResultValue(searchFieldValues[0].value);
  }
  await searchPage.verifyResultStatus(expectedStatus);

  console.log('[searchMain] Multi-field search verification passed');
}

export async function mainSearchVerifyNoResultColumns(
  page: Page,
  objectType: string,
  methodName: string,
  searchValue: string,
  expectedStatus: string,
  fieldLabels?: string[],
  fieldOperators?: FieldOperators[]
): Promise<void> {
  console.log(`[searchMain] Main Search (No Result Columns): ${objectType} / ${methodName} = ${searchValue}`);
  const searchPage = new MainSearchPage(page);

  await searchPage.gotoMasterDataTab();
  await searchPage.selectObjectType(objectType);
  await searchPage.selectSearchMethod(methodName);

  await verifyFields(searchPage, fieldLabels, fieldOperators);

  await searchPage.fillSearchValue(searchValue);
  await searchPage.clickSearch();

  await searchPage.verifyResultStatus(expectedStatus);
  await expect(searchPage.page.getByText(searchValue, { exact: true }).first()).not.toBeVisible({ timeout: 5000 });

  console.log('[searchMain] No result columns verification passed');
}
