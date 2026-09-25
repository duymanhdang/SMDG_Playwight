import { Page, Locator, expect } from '@playwright/test';
import { fillUI5Field } from '../ui/ui5';

/**
 * Click value-help icon (F4) của field dựa vào Label text
 * Pattern SAP: input id = "__inputN", icon id = "__inputN-vhi"
 */
export async function clickValueHelp(page: Page, labelText: string): Promise<void> {
  const label = page
    .getByRoleUI5('Label', { text: labelText })
    .and(page.locator('label[for]'))
    .first();

  const forAttr = await label.getAttribute('for');
  if (!forAttr) throw new Error(`Label "${labelText}" không có attribute "for"`);

  const inputId = forAttr.replace('-inner', '');
  await page.locator(`[id="${inputId}-vhi"]`).click();
}

/**
 * Select giá trị từ F4 dialog (value-help popup)
 * Flow: search keyword → click result trong dialog
 */
export async function selectFromValueHelp(
  page: Page,
  keyword: string,
  value: string
): Promise<void> {
  const dialogSearch = page.locator('[id$="-searchField"]').last();
  await expect(dialogSearch).toBeVisible({ timeout: 10000 });

  await page
    .waitForSelector('.sapUiLocalBusyIndicator', {
      state: 'hidden',
      timeout: 15000,
    })
    .catch(() => {});

  await fillUI5Field(dialogSearch, keyword);
  await page.locator('[id$="-searchField"] input').last().press('Enter');
  await page.waitForTimeout(1000);

  // Scope click vào Dialog — tránh strict mode
  const resultInDialog = page
    .locator('.sapMDialog')
    .last()
    .getByText(value, { exact: true })
    .first();

  await expect(resultInDialog).toBeVisible({ timeout: 10000 });
  await resultInDialog.click();
  console.log(`[ValueHelp] Selected: "${value}" (keyword: "${keyword}")`);
}
