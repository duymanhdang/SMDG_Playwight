import { Page } from '@playwright/test';
import { AdminPage } from '../../pages/admin/AdminPage';
import { AdminActions } from '../../pages/actions/AdminActions';

/**
 * Shared admin-config reset helpers.
 *
 * All specs that modify a shared admin template (System Approve / System
 * Activate / Multi-Approver) MUST reset the template back to default so a
 * failing test does not poison the next test in the same suite run.
 *
 * Two reset patterns exist:
 *   - resetSystemAutoConfig:   disables System Approve + System Activate
 *   - resetMultiApproverConfig: deletes the extra approval-sequence row
 */

export interface SystemAutoConfigOptions {
  /** Template name as shown in Process Designer (e.g. 'AUTO_BP01'). */
  templateName: string;
  /** Condition id used to locate the condition table row (e.g. 'AUTOBP01'). */
  conditionId: string;
  /** Optional default approver to restore (used by the COMMENT_LOGO suite). */
  defaultApprover?: string;
}

export interface MultiApproverConfigOptions {
  /** Template name as shown in Process Designer. */
  templateName: string;
  /** Approver key whose extra approval-sequence row should be deleted. */
  approverKey: string;
  /** Tree node name to select (default: 'ROOT'). */
  treeNode?: string;
}

export type AdminConfigOptions = SystemAutoConfigOptions | MultiApproverConfigOptions;

function isSystemAutoConfig(opts: AdminConfigOptions): opts is SystemAutoConfigOptions {
  return 'conditionId' in opts;
}

/**
 * Reset System Approve + System Activate back to default.
 * Navigates to Process Designer → opens template → disables both → saves.
 */
export async function resetSystemAutoConfig(
  page: Page,
  admin: AdminPage,
  adminActions: AdminActions,
  opts: SystemAutoConfigOptions
): Promise<void> {
  console.log(`[ConfigReset] Resetting System Approve/Activate for ${opts.templateName}...`);

  await admin.gotoProcessDesigner();
  await admin.searchTemplate(opts.templateName);
  await admin.openTemplate(opts.templateName);

  // Disable System Approve
  await admin.gotoWorkflowSettings();
  await admin.gotoConditionSettings();
  await admin.searchConditionTable(opts.conditionId);
  await admin.clickEditConditionTable(opts.conditionId);
  await adminActions.disableSystemApprove(opts.defaultApprover);
  await admin.navigateBack();
  await page.waitForTimeout(2000);

  // Disable System Activate
  await admin.gotoTemplateSettings();
  await adminActions.disableSystemActivate();
  await admin.saveTemplate();
  await admin.activateTemplate();

  console.log(`[ConfigReset]  System Approve/Activate reset for ${opts.templateName}`);
}

/**
 * Reset multi-approver config: delete the extra approval-sequence row.
 */
export async function resetMultiApproverConfig(
  admin: AdminPage,
  adminActions: AdminActions,
  opts: MultiApproverConfigOptions
): Promise<void> {
  console.log(`[ConfigReset] Resetting multi-approver for ${opts.templateName}...`);

  await admin.gotoProcessDesigner();
  await admin.searchTemplate(opts.templateName);
  await admin.openTemplate(opts.templateName);
  await adminActions.resetMultiApprover(opts.approverKey, opts.treeNode ?? 'ROOT');

  console.log(`[ConfigReset]  Multi-approver reset for ${opts.templateName}`);
}

/**
 * Best-effort reset of shared admin config. Never throws — logs failures so
 * cleanup can never mask the original test error. Used from `finally` blocks
 * and defensive setup.
 */
export async function resetAdminConfigBestEffort(
  page: Page,
  admin: AdminPage,
  adminActions: AdminActions,
  opts: AdminConfigOptions,
  label = 'reset config'
): Promise<void> {
  try {
    if (isSystemAutoConfig(opts)) {
      await resetSystemAutoConfig(page, admin, adminActions, opts);
    } else {
      await resetMultiApproverConfig(admin, adminActions, opts);
    }
    console.log(`[ConfigReset] ${label} — done`);
  } catch (err) {
    console.log(
      `[ConfigReset] ${label} — FAILED (best-effort, ignored): ${(err as Error).message}`
    );
  }
}
