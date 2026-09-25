import { test, expect, Page } from '@playwright/test';
import { loginToSimpleMDG } from '../../helpers/auth';
import { searchAndClick } from '../../helpers/search';

/**
 * TC04 — Search và Verify kết quả
 *
 * Flow:
 *   1. Search theo CR number  → verify Request ID + Status
 *   2. Search theo Description → verify có rows + CR number
 *   3. Search không có kết quả → verify no data
 *
 * Locator patterns:
 *   - searchAndClick()                      : fill + click search button
 *   - getByRoleUI5('ColumnListItem')        : table rows
 *   - .filter({ hasText })                  : lọc row theo text
 *   - getByRoleUI5('ObjectStatus', {text})  : status badge trong row
 */
test.describe('SMOKE-04: Search and verify results', { tag: ['@bp'] }, () => {
  async function navigateToMyRequest(page: Page) {
    await page.getByRoleUI5('IconTabFilter', { text: 'My Request' }).click();
    const searchField = page.getByRoleUI5('SearchField');
    await expect(searchField).toBeVisible();
    return searchField;
  }

  test.describe('Search checks', { tag: ['@bp'] }, () => {
    test(
      '01 - Search theo CR number: verify Request ID và Status',
      { tag: ['@smoke', '@happy-path'] },
      async ({ page }) => {
        await loginToSimpleMDG(page);

        const TARGET_CR = 'CR0000015564';
        const EXPECTED_STATUS = 'CANCELLED';

        const searchField = await navigateToMyRequest(page);
        await searchAndClick(page, searchField, TARGET_CR);

        // Đợi search hoàn tất — khi search theo CR number chính xác
        // app sẽ filter xuống đúng 1 row duy nhất
        // Dùng expect.poll() để đợi cho đến khi rowCount = 1
        await expect
          .poll(
            async () => {
              return await page.getByRoleUI5('ColumnListItem').count();
            },
            {
              message: 'Đợi bảng filter xuống 1 row',
              timeout: 15000,
            }
          )
          .toBe(1);

        const rowCount = await page.getByRoleUI5('ColumnListItem').count();
        console.log(`Số rows sau khi search: ${rowCount}`);

        // ── Verify 1: Đúng 1 row ──────────────────────────────────────────────
        expect(rowCount).toBe(1);

        // ── Verify 2: Request ID đúng ─────────────────────────────────────────
        const crRow = page.getByRoleUI5('ColumnListItem').filter({ hasText: TARGET_CR });
        await expect(crRow).toBeVisible({ timeout: 10000 });
        console.log(`✅ Request ID ${TARGET_CR} tìm thấy`);

        // ── Verify 3: Status đúng ─────────────────────────────────────────────
        await expect(crRow.getByRoleUI5('ObjectStatus', { text: EXPECTED_STATUS })).toBeVisible();
        console.log(`✅ Status ${EXPECTED_STATUS} xác nhận đúng`);

        console.log(`✅ 01 PASSED — ${TARGET_CR}: Request ID ✓  Status ✓`);
      }
    );

    test(
      '02 - Search theo Description: verify có rows và CR number',
      { tag: ['@smoke', '@happy-path'] },
      async ({ page }) => {
        await loginToSimpleMDG(page);

        const SEARCH_DESC = 'New CR created by Playwright test';

        const searchField = await navigateToMyRequest(page);
        await searchAndClick(page, searchField, SEARCH_DESC);

        // Đợi bảng load
        await expect(page.getByRoleUI5('Button', { text: '...' }).first()).toBeVisible({
          timeout: 15000,
        });

        // Verify 1: Có ít nhất 1 row
        const rows = page.getByRoleUI5('ColumnListItem');
        const rowCount = await rows.count();
        console.log(`Số rows: ${rowCount}`);
        expect(rowCount).toBeGreaterThan(0);

        // Verify 2: Row đầu tiên chứa CR number
        const firstRow = rows.first();
        const rowText = (await firstRow.textContent()) || '';
        const crMatch = rowText.match(/CR\d{10}/);
        expect(crMatch, 'Row phải chứa CR number').toBeTruthy();
        console.log(`✅ CR number trong row: ${crMatch?.[0]}`);

        console.log('✅ 02 PASSED — Search theo Description');
      }
    );

    test(
      '03 - Search không có kết quả: verify no data',
      { tag: ['@smoke', '@negative'] },
      async ({ page }) => {
        await loginToSimpleMDG(page);

        const INVALID_CR = 'CR9999999999';

        const searchField = await navigateToMyRequest(page);
        await searchAndClick(page, searchField, INVALID_CR);

        await expect
          .poll(
            async () => {
              return await page.getByRoleUI5('ColumnListItem').count();
            },
            {
              message: 'Đợi bảng trả về trạng thái không có dữ liệu',
              timeout: 15000,
            }
          )
          .toBe(0);

        // Verify: không có row
        const rowCount = await page.getByRoleUI5('ColumnListItem').count();
        console.log(`Số rows với keyword không hợp lệ: ${rowCount}`);
        expect(rowCount).toBe(0);

        // Verify: không có button "..."
        const btnCount = await page.getByRoleUI5('Button', { text: '...' }).count();
        expect(btnCount).toBe(0);

        console.log('✅ 03 PASSED — No data khi search không hợp lệ');
      }
    );
  });
});
