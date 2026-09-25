import { Page, expect } from '@playwright/test';

/**
 * helpers/commentVerification.ts
 *
 * Extracts the repeated comment-popover open / verify / close pattern
 * used across all COMMENT_LOGO testcases.
 *
 * Two view modes:
 *   1. Approver / normal view  → "Comments" button (getByRoleUI5)
 *   2. Activated / final view  → button[title="Comments"] + .last() for title
 *
 * Each comment entry has three components to verify:
 *   - comment text  (Label)
 *   - email / user  (Link)
 *   - action label  (Label, e.g. "SUBMIT  -")
 *
 * When the same email appears in multiple entries, use `emailUseLast`
 * to disambiguate:
 *   - newest (first in DOM): keep defaults (useLast = false)
 *   - oldest  (last in DOM): set emailUseLast = true
 *
 * For 3+ entries with the same email, use `emailNth` (0-based index
 * into the full locator result) for precise targeting.
 *
 * @param text         - The comment-body text (e.g. suiteConfig.comments.requestorSubmit)
 * @param email        - Email shown in the comment header (e.g. suiteConfig.accounts.requestor.user)
 * @param action       - Action label text (e.g. 'SUBMIT' or 'APPROVE')
 * @param useLast      - Use .last() for ALL three components (convenience)
 * @param textUseLast  - Use .last() for the text label only
 * @param emailUseLast - Use .last() for the email link only
 * @param actionUseLast - Use .last() for the action label only
 * @param textNth      - 0-based index for text label (overrides useLast/textUseLast)
 * @param emailNth     - 0-based index for email link (overrides useLast/emailUseLast)
 * @param actionNth    - 0-based index for action label (overrides useLast/actionUseLast)
 */
export interface CommentEntry {
  text: string;
  email: string;
  action: string;
  useLast?: boolean;
  textUseLast?: boolean;
  emailUseLast?: boolean;
  actionUseLast?: boolean;
  textNth?: number;
  emailNth?: number;
  actionNth?: number;
}

/**
 * Open the Comments popover.
 *
 * @param page            - Playwright Page
 * @param isActivatedView - true = use button[title="Comments"] (final verify)
 */
export async function openCommentPopover(page: Page, isActivatedView = false): Promise<void> {
  if (isActivatedView) {
    const btn = page.locator('button[title="Comments"]').last();
    // Wait for button to be actually visible (data fully loaded)
    await expect(btn).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(500);
    await btn.click({ timeout: 10000 });
    await page.waitForTimeout(3000);
  } else {
    await page.getByRoleUI5('Button', { text: 'Comments' }).first().click();
    await page.waitForTimeout(1000);
  }
}

/**
 * Close the Comments popover.
 *
 * @param page            - Playwright Page
 * @param isActivatedView - true = use button[title="Comments"] (final verify)
 */
export async function closeCommentPopover(page: Page, isActivatedView = false): Promise<void> {
  if (isActivatedView) {
    await page.locator('button[title="Comments"]').last().click();
  } else {
    await page.getByRoleUI5('Button', { text: 'Comments' }).first().click();
  }
  await page.waitForTimeout(500);
}

/**
 * Verify the Comments title is visible after opening the popover.
 *
 * @param page            - Playwright Page
 * @param isActivatedView - true = use .last() on the title
 */
export async function verifyCommentTitle(page: Page, isActivatedView = false): Promise<void> {
  const title = page.getByRoleUI5('Title', { text: 'Comments' });
  if (isActivatedView) {
    await expect(title.last()).toBeAttached({ timeout: 10000 });
  } else {
    await expect(title).toBeVisible({ timeout: 10000 });
  }
}

/**
 * Verify a single comment entry (text + email + action).
 *
 * @param page  - Playwright Page
 * @param entry - CommentEntry describing what to verify
 */
function pickNth<T>(locator: any, nth?: number, useLast?: boolean): any {
  if (nth !== undefined) return locator.nth(nth);
  if (useLast) return locator.last();
  return locator.first();
}

export async function verifyCommentEntry(page: Page, entry: CommentEntry): Promise<void> {
  const { text, email, action, useLast, textUseLast, emailUseLast, actionUseLast, textNth, emailNth, actionNth } = entry;

  // Comment text — SAPUI5 truncates visible text with "..." (sapMTextMaxWidth),
  // so getByText may fail on long comments. The title attribute always has the
  // full text, so prefer getByTitle; fall back to getByText for short comments
  // that are not truncated.
  const textLabel = page.getByTitle(text);
  const textCount = await textLabel.count();
  const textLocator = textCount > 0 ? textLabel : page.getByText(text);
  await expect(pickNth(textLocator, textNth, textUseLast ?? useLast)).toBeAttached({ timeout: 30000 });

  // Email link
  const emailLink = page.getByRoleUI5('Link', { text: `${email}: ` });
  await expect(pickNth(emailLink, emailNth, emailUseLast ?? useLast)).toBeAttached();

  // Action label (e.g. "SUBMIT  -")
  const actionLabel = page.getByRoleUI5('Label', { text: `${action}  -` });
  await expect(pickNth(actionLabel, actionNth, actionUseLast ?? useLast)).toBeAttached();
}

/**
 * Full convenience: open → verify title → verify each entry → close.
 *
 * @param page            - Playwright Page
 * @param entries         - Array of CommentEntry objects (newest-first order)
 * @param isActivatedView - true = use final-verify locators
 */
export async function verifyComments(
  page: Page,
  entries: CommentEntry[],
  isActivatedView = false
): Promise<void> {
  await openCommentPopover(page, isActivatedView);
  await verifyCommentTitle(page, isActivatedView);

  for (const entry of entries) {
    await verifyCommentEntry(page, entry);
  }

  await closeCommentPopover(page, isActivatedView);
}
