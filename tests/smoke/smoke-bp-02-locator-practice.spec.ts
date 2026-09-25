import { test, expect, Page } from '@playwright/test';
import { loginToSimpleMDG } from '../../helpers/auth';
import { fillUI5Field, getFieldByLabel, getFieldByLabelText } from '../../helpers/ui';
import { submitCRWithConfirm, waitForCRStatus, verifyCRStatus } from '../../helpers/workflow';

test.describe(
  'SMOKE-02: Copy Request → Submit → Cancel (locator practice)',
  { tag: ['@bp'] },
  () => {
    const SOURCE_CR = 'CR0000015052';

    async function openCopyRequestForm(page: Page): Promise<void> {
      await loginToSimpleMDG(page);
      await page.getByRoleUI5('IconTabFilter', { text: 'My Request' }).click();
      const searchField = page.getByRoleUI5('SearchField');
      await expect(searchField).toBeVisible();
      await fillUI5Field(searchField, SOURCE_CR);
      await searchField.press('Enter');
      await expect(page.getByRoleUI5('Button', { text: '...' }).first()).toBeVisible({
        timeout: 15000,
      });

      // ── BƯỚC 4: Mở form Copy request ─────────────────────────────────────────
      await page.getByRoleUI5('Button', { text: '...' }).first().click();
      await page.getByRoleUI5('MenuItem', { text: 'Copy request' }).click();
      await expect(page.getByRoleUI5('Label', { text: 'Business Partner' }).first()).toBeVisible({
        timeout: 15000,
      });
    }

    async function fillCopyHeader(page: Page, description: string, notes: string): Promise<void> {
      await fillUI5Field(
        page.getByRoleUI5('TextArea', { valueStateText: 'Please fill out Description' }),
        description
      );
      await page.getByRoleUI5('Select', { valueStateText: 'Please fill out Priority' }).click();
      await page.getByRoleUI5('Item', { text: 'MEDIUM' }).click();
      await page
        .getByRoleUI5('Select', { selectedKey: '6e666348-ff4a-4088-8287-274a92ab326c' })
        .click();
      await page.getByRoleUI5('Item', { text: 'New Business Partner' }).click();
      const notesField = getFieldByLabelText(page, 'Other reason', 'textarea');
      await notesField.click();
      await notesField.press('Control+A');
      await notesField.fill(notes);
    }

    test.describe('Flow checks', { tag: ['@bp'] }, () => {
      test(
        '01 - Copy CR, submit → SUBMITTED, cancel → CANCELLED',
        { tag: ['@smoke'] },
        async ({ page }) => {
          await openCopyRequestForm(page);
          await fillCopyHeader(page, 'New CR created by Playwright test', 'Playwright test notes');

          const searchField = page.getByRoleUI5('SearchField');
          const newCR = await submitCRWithConfirm(page);
          await waitForCRStatus(page, searchField, newCR, 'SUBMITTED');
          await verifyCRStatus(page, newCR, 'SUBMITTED');

          await page.getByRoleUI5('Button', { text: '...' }).first().click();
          await page.getByRoleUI5('MenuItem', { text: 'Cancel request' }).click();
          await page.getByRoleUI5('Button', { text: 'Yes' }).first().click();

          await waitForCRStatus(page, searchField, newCR, 'CANCELLED');
          await verifyCRStatus(page, newCR, 'CANCELLED');
          console.log(`✅ 01 PASSED — CR ${newCR} Submit → SUBMITTED → Cancel → CANCELLED`);
        }
      );
    });

    test.describe('Locator checks', { tag: ['@bp'] }, () => {
      test(
        '02 - Form field: locateUI5 vs getFieldByLabel cho field Customer',
        { tag: ['@smoke'] },
        async ({ page }) => {
          await openCopyRequestForm(page);

          const countLocateUI5 = await page
            .locateUI5('//FormContainer[1]/FormElement[1]/Input[1]')
            .count();
          console.log(`locateUI5 count: ${countLocateUI5} → KHÔNG dùng cho Form fields`);

          const customerField = await getFieldByLabel(page, 'Customer');
          await expect(customerField).toBeVisible();
          await customerField.click();
          await customerField.press('Control+A');
          await customerField.fill('CUST-TEST-001');
          await expect(customerField).toHaveValue('CUST-TEST-001');
          console.log('✅ 02 PASSED — getFieldByLabel phù hợp hơn locateUI5 cho Form fields');
        }
      );

      test(
        '03 - Dialog TextArea: locateUI5 phù hợp vì Dialog unique',
        { tag: ['@smoke'] },
        async ({ page }) => {
          await openCopyRequestForm(page);
          await fillCopyHeader(page, 'TC02 Dialog test', 'TC02 locator notes');

          await page.getByRoleUI5('Button', { text: 'Submit' }).click();
          const dialogTA = page.locateUI5('//Dialog[1]/TextArea[1]');
          await expect(dialogTA).toBeVisible({ timeout: 10000 });
          const count = await dialogTA.count();
          console.log(`Dialog TextArea count: ${count} → locateUI5 an toàn`);
          await page.getByRoleUI5('Button', { text: 'Cancel' }).click();
          console.log('✅ 03 PASSED — locateUI5 phù hợp khi control type unique');
        }
      );

      test(
        '04 - Bảng Telephone: DOM selector cho sap.ui.table.Table',
        { tag: ['@smoke'] },
        async ({ page }) => {
          await openCopyRequestForm(page);

          const countAll = await page.locateUI5('//Table[1]/OverflowToolbar[1]/Button[1]').count();
          console.log(`locateUI5 Table Button count: ${countAll} → quá nhiều`);

          const telephoneToolbar = page.locator('[role="toolbar"]').filter({
            has: page.locator('span').filter({ hasText: /^Telephone$/ }),
          });
          const toolbarCount = await telephoneToolbar.count();
          console.log(`Telephone toolbar count: ${toolbarCount}`);
          await expect(telephoneToolbar).toBeVisible({ timeout: 10000 });

          const addBtn = telephoneToolbar.locator('button[aria-label="Add"]').first();
          await expect(addBtn).toBeVisible();
          console.log('✅ 04 PASSED — DOM selector ổn định cho sap.ui.table.Table');
        }
      );
    });
  }
);
