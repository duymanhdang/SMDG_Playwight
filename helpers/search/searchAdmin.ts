import { Page } from '@playwright/test';
import { AdminSearchMethodPage } from '../../pages/admin/AdminSearchMethodPage';
import { AdminSearchResultPage } from '../../pages/admin/AdminSearchResultPage';

export async function adminConfigSearchMethod(
  page: Page,
  methodId: string,
  methodName: string,
  templateName: string,
  fieldConfigs: { businessTable: string; fieldName: string; controlType: string }[]
): Promise<void> {
  console.log(`[searchAdmin] Configuring search method: ${methodId}`);
  const methodPage = new AdminSearchMethodPage(page);

  await methodPage.gotoSearchMethodSettings(templateName);
  await methodPage.clickAddMethod();
  await methodPage.fillMethodDialog(methodId, methodName);
  await methodPage.confirmAddMethod();
  await methodPage.verifyMethodById(methodId);
  await methodPage.verifyMethodInList(methodName);

  await methodPage.selectMethod(methodName);
  await methodPage.clickAddFields();

  for (const [i, fc] of fieldConfigs.entries()) {
    if (i > 0) await methodPage.clickAddFields();
    await methodPage.selectBusinessTable(fc.businessTable);
    await methodPage.selectFieldFromTable(fc.fieldName);
    await methodPage.confirmAddField();
    await methodPage.verifyFieldInList(fc.fieldName);
    await methodPage.verifyControlType(fc.fieldName, fc.controlType);
  }

  console.log('[searchAdmin] Search method configured successfully');
}

export async function adminConfigSearchResult(
  page: Page,
  methodId: string,
  methodName: string,
  resultFields: string[]
): Promise<void> {
  console.log(`[searchAdmin] Configuring search result fields for method: ${methodId}`);
  const resultPage = new AdminSearchResultPage(page);

  await resultPage.gotoSearchResultSettings();
  await resultPage.searchMethod(methodId);
  await resultPage.selectMethodFromList(methodName);

  for (const [i, fieldName] of resultFields.entries()) {
    console.log(`\n[searchAdmin] Adding result field ${i + 1}/${resultFields.length}: ${fieldName}`);
    await resultPage.openValueHelp();
    await resultPage.searchFieldInValueHelp(fieldName);
    await resultPage.selectFirstRowInValueHelp(fieldName);
    await resultPage.saveAndCloseValueHelp();
    console.log(`[searchAdmin] ✓ Field ${fieldName} added`);
  }

  console.log('[searchAdmin] Search result fields configured successfully');
}

export async function adminVerifyDuplicateAndCreateMethod(
  page: Page,
  methodId: string,
  methodName: string,
  templateName: string,
  duplicateMethodId: string,
  duplicateMethodName: string,
  expectedErrorText: string,
  fieldConfigs: { businessTable: string; fieldName: string; controlType: string }[]
): Promise<void> {
  console.log(`[searchAdmin] Duplicate check + create method: ${methodId}`);
  const methodPage = new AdminSearchMethodPage(page);

  // Navigate once
  await methodPage.gotoSearchMethodSettings(templateName);

  // Duplicate check
  await methodPage.clickAddMethod();
  await methodPage.fillMethodDialog(duplicateMethodId, duplicateMethodName);
  await methodPage.confirmAddMethod();
  await methodPage.verifyErrorMessage(expectedErrorText);
  await methodPage.closeErrorDialog();
  await methodPage.cancelAddMethod();

  // Create real method (no re-navigation, already on Search Method Settings)
  await methodPage.clickAddMethod();
  await methodPage.fillMethodDialog(methodId, methodName);
  await methodPage.confirmAddMethod();
  await methodPage.verifyMethodById(methodId);
  await methodPage.verifyMethodInList(methodName);

  // Add fields
  await methodPage.selectMethod(methodName);
  await methodPage.clickAddFields();

  for (const [i, fc] of fieldConfigs.entries()) {
    if (i > 0) await methodPage.clickAddFields();
    await methodPage.selectBusinessTable(fc.businessTable);
    await methodPage.selectFieldFromTable(fc.fieldName);
    await methodPage.confirmAddField();
    await methodPage.verifyFieldInList(fc.fieldName);
    await methodPage.verifyControlType(fc.fieldName, fc.controlType);
  }

  console.log('[searchAdmin] Search method configured successfully (with duplicate check)');
}

export async function adminEditFieldControlTypes(
  page: Page,
  editConfigs: {
    fieldName: string;
    newControlType: string;
    f4SourceData?: { entity: string; keyField: string };
    dropdownSourceData?: { entity: string; keyField: string; displayFields: string[]; visibleFields: string[] };
  }[]
): Promise<void> {
  console.log('[searchAdmin] Editing field control types...');
  const methodPage = new AdminSearchMethodPage(page);

  await methodPage.clickEditFields();

  for (const cfg of editConfigs) {
    await methodPage.changeFieldControlType(cfg.fieldName, cfg.newControlType);

    if (cfg.f4SourceData) {
      await methodPage.clickFieldSourceData(cfg.fieldName);
      await methodPage.configureF4SourceData(cfg.f4SourceData.entity, cfg.f4SourceData.keyField);
    }

    if (cfg.dropdownSourceData) {
      await methodPage.clickFieldSourceData(cfg.fieldName);
      // Display fields — index 1-based (languageID=item1)
      const displayIdx = cfg.dropdownSourceData.displayFields.map((_, i) => i + 1);
      // Visible Fields Grid — index 1-based (languageID=item1, description=item2)
      // "Allow Show Description" is a separate checkbox, handled inside configureDropdownSourceData
      const visibleIdx = cfg.dropdownSourceData.visibleFields
        .filter(vf => vf !== 'Allow Show Description')
        .map((_, i) => i + 1);
      await methodPage.configureDropdownSourceData(
        cfg.dropdownSourceData.entity,
        cfg.dropdownSourceData.keyField,
        displayIdx,
        visibleIdx
      );
    }
  }

  await methodPage.saveSearchMethodSettings();

  for (const cfg of editConfigs) {
    await methodPage.verifyFieldHasControlType(cfg.fieldName, cfg.newControlType);
  }

  console.log('[searchAdmin] Field control types updated successfully');
}

export async function adminDeleteSearchMethod(
  page: Page,
  methodId: string,
  methodName: string
): Promise<void> {
  console.log(`[searchAdmin] Deleting search method: ${methodId}`);
  const methodPage = new AdminSearchMethodPage(page);

  await methodPage.deleteMethod(methodId);
  await methodPage.verifyMethodNotVisible(methodName);

  console.log('[searchAdmin] Search method deleted successfully');
}

