import { Page, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Ensure .env is loaded
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Login vào SimpleMDG QAS qua SAP IAS (2-step auth)
 * Flow: navigate → email → Continue → password → Continue → click Application
 *
 * LƯU Ý: SAPLogin() built-in KHÔNG dùng được cho app này vì SAP IAS
 * có login flow riêng khác với Fiori Launchpad chuẩn.
 *
 * LƯU Ý: Token SAP IAS thay đổi mỗi lần login → KHÔNG reuse storageState.
 */
export async function loginToSimpleMDG(page: Page): Promise<void> {
  const BASE_URL = process.env.BASE_URL || '';
  const SAP_USER = process.env.SAP_USER || '';
  const SAP_PASS = process.env.SAP_PASS || '';
  console.log('[login] BASE_URL:', BASE_URL, 'user:', SAP_USER);
  await page.context().clearCookies();
  await page.goto(BASE_URL);
  await page.getByRole('textbox', { name: 'Email or User Name' }).fill(SAP_USER);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill(SAP_PASS);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('link', { name: 'Application' }).click();
  await page.waitForURL('**/main/index.html');
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('.sapUiLocalBusyIndicator', {
      state: 'hidden',
      timeout: 60000,
    })
    .catch(() => {});
  await page
    .waitForSelector('.sapMIBar', {
      state: 'visible',
      timeout: 30000,
    })
    .catch(() => {});
  // .sapMIBar (top bar) can render before the landing Dashboard itself has
  // started rendering its "Welcome ..." heading (sapMTitle/H3, e.g. "Welcome
  // SimpleMDG | Approver | Automation") — proceeding at that point races the
  // Dashboard's own initialization (seen as: tab clicks issued right after
  // login get visually "selected" but the SPA router never swaps the content
  // pane). Wait for this heading — a real positive signal the Dashboard has
  // actually rendered — before doing anything else.
  await expect(page.getByRoleUI5('Title', { text: 'Welcome' }).first()).toBeVisible({ timeout: 30000 });
  await waitForUserSettingsLoaded(page);
  console.log('[Auth] Login successful — dashboard ready');
}

/**
 * Login vào SimpleMDG với credentials tùy chỉnh
 * Dùng cho multi-role testing: Approver, Steward dùng account riêng
 */
export async function loginAs(page: Page, user: string, pass: string): Promise<void> {
  const BASE_URL = process.env.BASE_URL || '';
  console.log('[loginAs] BASE_URL:', BASE_URL, 'user:', user);
  await page.context().clearCookies();
  await page.goto(BASE_URL, { timeout: 60000 });
  await page.getByRole('textbox', { name: 'Email or User Name' }).fill(user);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill(pass);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Wait for post-login page to load
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // Check if admin user to navigate to admin page
  const isAdmin = user === (process.env.ADMIN_USER || '');
  if (isAdmin) {
    console.log('[Auth] Admin user detected, navigating to admin page...');
    // Navigate to admin URL (default page is Global Settings)
    await page.goto(`${process.env.BASE_URL || ''}/admin/index.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(5000);
    console.log(`[Auth] Admin page loaded: ${page.url()}`);
  } else {
    const appLink = page.getByRole('link', { name: 'Application' });
    await expect(appLink).toBeVisible({ timeout: 30000 });
    await appLink.click();
    await page.waitForURL('**/main/index.html', { timeout: 60000 });
  }

  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForSelector('.sapUiLocalBusyIndicator', {
      state: 'hidden',
      timeout: 60000,
    })
    .catch(() => {});
  await page
    .waitForSelector('.sapMIBar', {
      state: 'visible',
      timeout: 30000,
    })
    .catch(() => {});
  if (!isAdmin) {
    // .sapMIBar (top bar) can render before the landing Dashboard itself has
    // started rendering its "Welcome ..." heading (sapMTitle/H3, e.g. "Welcome
    // SimpleMDG | Approver | Automation") — proceeding at that point races the
    // Dashboard's own initialization (seen as: tab clicks issued right after
    // login get visually "selected" but the SPA router never swaps the content
    // pane). Wait for this heading — a real positive signal the Dashboard has
    // actually rendered — before doing anything else.
    // The admin app (/admin/index.html) is a completely different SPA with no
    // Dashboard/"Welcome" heading at all — skip both this and the KPI/user-
    // settings wait for that branch, or they always time out for admin users.
    await expect(page.getByRoleUI5('Title', { text: 'Welcome' }).first()).toBeVisible({ timeout: 30000 });
    await waitForUserSettingsLoaded(page);
  }
  console.log('[Auth] Login successful — dashboard ready');
}

/**
 * After the app shell renders, the landing Dashboard kicks off its own async
 * KPI/user-settings load — visible as a "KPI Loading / Please wait" tile plus
 * a floating "Loading user settings....." toast (seen especially on accounts
 * with combined/multiple roles, e.g. an Approver account that also has a
 * Steward Manager view). Until it resolves, a tab click issued right after
 * login can silently fail to swap the content pane: the clicked tab (e.g.
 * "My Inbox") highlights as selected in the nav bar, but the pane underneath
 * stays frozen on the Dashboard's own loading placeholder — reproduced via
 * screenshot on the S4_QAS project, not just theorized.
 *
 * Give it a budget matching this codebase's convention for slow backend/mass
 * processing (up to a few minutes, see waitForCRStatus/MassActivationPage's
 * waitForDoneStatus).
 *
 * Confirmed via a real run on the S4_QAS project (att-e2e-mm-06): when this
 * genuinely doesn't clear within budget, letting the test proceed anyway
 * just fails minutes later at an unrelated-looking spot ("My Request" tab
 * not found) — a confusing error far from the real cause, and only after
 * wasting the rest of the test's timeout budget getting there. Throw here
 * instead so the failure is immediate and points at the actual root cause;
 * Playwright's own test-level retry (fresh login, fresh KPI load attempt) is
 * the real recovery mechanism for a transient backend hang like this, not
 * client-side waiting. Best-effort only in the sense that accounts which
 * never show these indicators (e.g. plain Requestor) resolve immediately and
 * are not slowed down or affected.
 */
async function waitForUserSettingsLoaded(page: Page, timeoutMs = 180000): Promise<void> {
  const startTime = Date.now();
  const indicators = [
    { label: 'Loading user settings', locator: page.getByText('Loading user settings', { exact: false }) },
    { label: 'KPI Loading', locator: page.getByText('KPI Loading', { exact: false }) },
  ];
  const results = await Promise.all(
    indicators.map(({ locator }) =>
      locator
        .waitFor({ state: 'hidden', timeout: timeoutMs })
        .then(() => true)
        .catch(() => false)
    )
  );
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const stuck = indicators.filter((_, i) => !results[i]).map((i) => i.label);
  if (stuck.length === 0) {
    console.log(`[Auth] Post-login KPI/user-settings load cleared after ${elapsed}s`);
    return;
  }
  throw new Error(
    `[Auth] Post-login load ("${stuck.join('", "')}") still visible after ${elapsed}s — ` +
      `backend KPI/user-settings call appears hung for this login, not a client-side timing issue`
  );
}
