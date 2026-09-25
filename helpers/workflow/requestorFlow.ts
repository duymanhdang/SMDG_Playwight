/**
 * helpers/requestorFlow.ts
 *
 * Composable helpers for the Requestor phase shared across all
 * COMMENT_LOGO testcases.
 *
 * Usage flow:
 *   1. setupRequestorSession(page, account)
 *   2. openCopyAndFillForm(page, myRequest, productForm, params)
 *   3. uploadAndVerifyLogo(page, 'valid.jpg')
 *   4. [draft steps — see helpers/draftFlow.ts]
 *   5. newCR = await form.submit(submitComment)
 *   6. myRequest.waitForStatus(...) / verifyStatus(...)
 */

import { Page } from '@playwright/test';
import { MyRequestPage } from '../../pages/cr/MyRequestPage';
import { ProductRequestForm } from '../../pages/cr/ProductRequestForm';
import { loginAs } from '../auth/login';

/** Parameters for the openCopyAndFillForm helper */
export interface RequestorFormParams {
  /** Source CR number to copy from */
  sourceCR: string;
  /** Timestamp string for unique lang descriptions */
  timestamp: string;
  /** Prefix for language descriptions (e.g. 'CL CR ') */
  langDescPrefix: string;
  /** Confirm label after form loads (default: 'Material Number') */
  confirmLabel?: string;
  /** Test-data fields */
  testData: {
    description: string;
    priority: string;
    reason?: string;
    notes: string;
  };
}

/**
 * Step 1: Login as the given account and navigate to My Request tab.
 *
 * @param page    - Playwright Page
 * @param account - { user, pass } object (from suiteConfig)
 */
export async function setupRequestorSession(
  page: Page,
  account: { user: string; pass: string }
): Promise<void> {
  await loginAs(page, account.user, account.pass);
}

/**
 * Step 2: Open the Copy-Request form for sourceCR, fill header fields
 * (description, priority, reason, notes), and update both language
 * descriptions (rows 0 and 1).
 *
 * @param page         - Playwright Page
 * @param myRequest    - MyRequestPage instance
 * @param productForm  - ProductRequestForm instance
 * @param params       - RequestorFormParams
 */
export async function openCopyAndFillForm(
  page: Page,
  myRequest: MyRequestPage,
  productForm: ProductRequestForm,
  params: RequestorFormParams
): Promise<void> {
  const { sourceCR, timestamp, langDescPrefix, testData } = params;
  const confirmLabel = params.confirmLabel || 'Material Number';

  await myRequest.goto();
  await myRequest.openCopyRequest(sourceCR, confirmLabel);

  await myRequest.fillHeader({
    description: testData.description,
    priority: testData.priority,
    reason: testData.reason,
    notes: testData.notes,
  });

  const langDesc = `${langDescPrefix}${timestamp}`;
  await productForm.updateLanguageDescriptionByRow(0, `${langDesc} EN`);
  await productForm.updateLanguageDescriptionByRow(1, `${langDesc} CA`);
}
