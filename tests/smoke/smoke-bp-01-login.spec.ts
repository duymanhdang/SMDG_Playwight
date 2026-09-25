import { test, expect } from '@playwright/test';
import { loginToSimpleMDG } from '../../helpers/auth';

test.describe('SMOKE-01: Login and verify landing page', { tag: ['@bp'] }, () => {
  test(
    'Login thành công và vào được dashboard',
    { tag: ['@smoke', '@happy-path'] },
    async ({ page }) => {
      // Bước 1: Login
      await loginToSimpleMDG(page);

      // Bước 2: Verify URL đúng
      await expect(page).toHaveURL(/main\/index\.html/);

      // Bước 3: Verify trang đã load
      await expect(page).toHaveTitle(/.+/);

      console.log('✅ Login thành công, URL:', page.url());
    }
  );
});
