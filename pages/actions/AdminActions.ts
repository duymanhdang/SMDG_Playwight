import { Page, expect } from '@playwright/test';

/**
 * AdminActions — Actions performed by Admin role
 *
 * IMPORTANT: Navigation / save / activate methods live in AdminPage.
 * This class only holds the config-tweak methods that are NOT in AdminPage:
 *   - enableSystemApprove / disableSystemApprove
 *   - enableSystemActivate / disableSystemActivate
 *   - configureMultiApprover / resetMultiApprover
 */
export class AdminActions {
  constructor(private page: Page) {}

  /**
   * Wait until all BusyIndicator elements are hidden (ignore if none present)
   */
  private async waitForBusy(timeout = 30000): Promise<void> {
    await this.page
      .waitForFunction(
        () => {
          const indicators = Array.from(document.querySelectorAll('.sapUiLocalBusyIndicator'));
          return indicators.every((el) => {
            const style = getComputedStyle(el as HTMLElement);
            return style.display === 'none' || style.visibility === 'hidden' || (el as HTMLElement).offsetParent === null;
          });
        },
        { timeout }
      )
      .catch(() => {});
  }

  /**
   * Enable System Approver - set SYSTEM_APPROVER as approver
   * Flow from skill config-autoapprove.md
   */
  async enableSystemApprove(): Promise<void> {
    console.log('[AdminActions] Enabling System Approve...');

    // Wait for page to stabilize
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(2000);

    // Click approver input field to open dialog
    const approverInput = this.page.locator('[id$="-vhi"]').first();
    await expect(approverInput).toBeVisible({ timeout: 20000 });
    await approverInput.click();
    console.log('[AdminActions] Approver input clicked');

    // Wait for dialog to appear
    const dialog = this.page.locator('[id$="dialog"][id*="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    console.log('[AdminActions] Dialog opened');

    // Search for SYSTEM_APPROVER
    const searchField = dialog.locator('[id$="searchField-I"]').first();
    await expect(searchField).toBeVisible({ timeout: 10000 });
    await searchField.fill('SYSTEM_APPROVER');
    console.log('[AdminActions] Filled SYSTEM_APPROVER in search');

    // Click search button
    const searchBtn = dialog.locator('[id$="searchField-search"]').first();
    await searchBtn.click();
    await this.page.waitForTimeout(1500);
    console.log('[AdminActions] Searched for SYSTEM_APPROVER');

    // Select SYSTEM_APPROVER from results
    const sysApprover = this.page.getByText('SYSTEM_APPROVER', { exact: true }).first();
    await expect(sysApprover).toBeVisible({ timeout: 10000 });
    await sysApprover.click();
    console.log('[AdminActions]  SYSTEM_APPROVER selected');

    // Click Update button using page-level locator as per user's suggestion
    const updateBtn = this.page.getByRole('button', { name: 'Update' });
    await expect(updateBtn).toBeVisible({ timeout: 10000 });
    await updateBtn.click();
    console.log('[AdminActions] Update button clicked');

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    console.log('[AdminActions]  System Approve enabled (SYSTEM_APPROVER set)');
  }

  /**
   * Disable System Approver - replace SYSTEM_APPROVER with default approver
   * Flow from reset-config.md
   */
  async disableSystemApprove(defaultApprover: string = process.env.APPROVER_USER || ''): Promise<void> {
    console.log(`[AdminActions] Disabling System Approve, resetting to: ${defaultApprover}`);

    // Click approver input field to open dialog
    const approverInput = this.page.locator('[id$="-vhi"]').first();
    await expect(approverInput).toBeVisible({ timeout: 15000 });
    await approverInput.click();
    console.log('[AdminActions] Approver input clicked');

    // Wait for dialog to appear
    const dialog = this.page.locator('[id$="dialog"][id*="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    console.log('[AdminActions] Dialog opened');

    // Search for default approver
    const searchField = dialog.locator('[id$="searchField-I"]').first();
    await expect(searchField).toBeVisible({ timeout: 10000 });
    await searchField.fill(defaultApprover);
    console.log(`[AdminActions] Filled ${defaultApprover} in search`);

    // Click search button
    const searchBtn = dialog.locator('[id$="searchField-search"]').first();
    await searchBtn.click();
    await this.page.waitForTimeout(1500);
    console.log(`[AdminActions] Searched for ${defaultApprover}`);

    // Select approver from results
    const approver = this.page.getByText(defaultApprover, { exact: true }).first();
    await expect(approver).toBeVisible({ timeout: 10000 });
    await approver.click();
    console.log(`[AdminActions]  ${defaultApprover} selected`);

    // Click Update button
    const updateBtn = this.page.getByRole('button', { name: 'Update' });
    await updateBtn.click();
    await this.page.waitForTimeout(2000);

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    console.log('[AdminActions]  System Approve disabled (default approver restored)');
  }

  /**
   * Enable System Activate (Bypass Steward Review)
   * Flow from skill config-autoactivate.md
   */
  async enableSystemActivate(): Promise<void> {
    console.log('[AdminActions] Enabling System Activate (Bypass Steward Review)...');

    // Navigate to Template Settings tab - use robust locator
    await this.page.locator('div').filter({ hasText: 'Template Settings' }).last().click();
    await this.page.waitForTimeout(2000);

    // Check the Bypass Steward Review checkbox
    const bypassCheckbox = this.page
      .getByRole('checkbox', {
        name: /Bypass Steward Review/i,
      })
      .first();
    await expect(bypassCheckbox).toBeVisible({ timeout: 10000 });

    const isChecked = await bypassCheckbox.getAttribute('aria-checked');
    if (isChecked !== 'true') {
      await bypassCheckbox.click();
      await this.page.waitForTimeout(1000);
      console.log('[AdminActions]  Bypass Steward Review checked');
    } else {
      console.log('[AdminActions] Bypass Steward Review already checked');
    }
  }

  /**
   * Disable System Activate (Uncheck Bypass Steward Review)
   * Flow from reset-config.md
   */
  async disableSystemActivate(): Promise<void> {
    console.log('[AdminActions] Disabling System Activate (Bypass Steward Review)...');

    // Navigate to Template Settings tab - use robust locator
    await this.page.locator('div').filter({ hasText: 'Template Settings' }).last().click();
    await this.page.waitForTimeout(2000);

    // Uncheck the Bypass Steward Review checkbox
    const bypassCheckbox = this.page
      .getByRole('checkbox', {
        name: /Bypass Steward Review/i,
      })
      .first();
    await expect(bypassCheckbox).toBeVisible({ timeout: 10000 });

    const isChecked = await bypassCheckbox.getAttribute('aria-checked');
    if (isChecked === 'true') {
      await bypassCheckbox.click();
      await this.page.waitForTimeout(1000);
      console.log('[AdminActions]  Bypass Steward Review unchecked');
    } else {
      console.log('[AdminActions] Bypass Steward Review already unchecked');
    }
  }

  /**
   * Configure multi-level approvers
   * @param approverKeys - Array of approver keys (e.g., ['AUTOBP01B'])
   * @param treeNode - Tree node name to select (default: 'ROOT')
   * Flow based on codegen steps
   */
  async configureMultiApprover(approverKeys: string[], treeNode: string = 'ROOT'): Promise<void> {
    console.log(`[AdminActions] Configuring multi-approver: ${approverKeys.join(', ')}...`);

    // Step 1: Navigate to Workflow Settings tab
    await this.page.getByRoleUI5('StandardListItem', { title: 'Workflow Settings' }).click();
    await this.page.waitForTimeout(2000);
    console.log('[AdminActions]  Workflow Settings tab opened');

    // Step 2: Navigate to Approval Process tab
    await this.page.getByRoleUI5('StandardListItem', { title: 'Approval Process' }).click();
    await this.page.waitForTimeout(2000);
    console.log('[AdminActions]  Approval Process tab opened');

    // Step 3: Select tree node - try multiple locator strategies
    console.log(`[AdminActions] Selecting tree node: ${treeNode}`);
    const treeLocators = [
      () => this.page.getByRoleUI5('StandardListItem', { title: treeNode }),
      () => this.page.locator(`[title="${treeNode}"]`),
      () => this.page.getByText(treeNode),
      () => this.page.locator(`span:has-text("${treeNode}")`),
    ];
    let treeSelected = false;
    for (const getLocator of treeLocators) {
      const el = getLocator();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.click();
        await this.page.waitForTimeout(1000);
        console.log(`[AdminActions]  Tree node "${treeNode}" selected`);
        treeSelected = true;
        break;
      }
    }
    if (!treeSelected) {
      throw new Error(`[AdminActions] Could not find tree node: ${treeNode}`);
    }

    // Step 4: Add approver rows
    for (let i = 0; i < approverKeys.length; i++) {
      const seq = (i + 2) * 10; // seq 20, 30, 40...
      console.log(`[AdminActions] Adding approver ${approverKeys[i]} with seq ${seq}...`);

      // Click "Add New" button - use last() to target the bottom-most one (Approval Level table)
      console.log('[AdminActions]   Looking for Add New button...');
      const allAddNew = this.page.getByRoleUI5('Button', { text: 'Add New' });
      const addNewCount = await allAddNew.count();
      console.log(`[AdminActions]   Found ${addNewCount} Add New button(s), using last()`);
      const addNewBtn = addNewCount > 0 ? allAddNew.last() : allAddNew;
      await expect(addNewBtn).toBeVisible({ timeout: 10000 });
      await addNewBtn.click();
      await this.page.waitForTimeout(1000);
      console.log('[AdminActions]    Clicked Add New');

      // Fill Sequence - use visible Input with type=Number (newest row)
      console.log('[AdminActions]   Looking for Sequence input...');
      const allNumberInputs = this.page.getByRoleUI5('Input', { type: 'Number' });
      const seqInputCount = await allNumberInputs.count();
      console.log(`[AdminActions]   Found ${seqInputCount} Number input(s)`);
      // Filter for visible inputs only — avoid matching hidden fields like attachmentExpirationInput
      const visibleNumberInputs = allNumberInputs.filter({ visible: true });
      const visibleCount = await visibleNumberInputs.count();
      console.log(`[AdminActions]   Found ${visibleCount} visible Number input(s), using last()`);
      const seqInput = visibleNumberInputs.last();
      await seqInput.click();
      await seqInput.fill(seq.toString());
      await this.page.waitForTimeout(500);
      console.log(`[AdminActions]    Filled sequence: ${seq}`);

      // Click value help icon to open approver dialog - use last() (newest row's icon)
      console.log('[AdminActions]   Looking for value-help icon...');
      const vhIcons = this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' });
      const vhCount = await vhIcons.count();
      console.log(`[AdminActions]   Found ${vhCount} value-help icon(s), using last()`);
      const valueHelpIcon = vhCount > 0 ? vhIcons.last() : vhIcons;
      await valueHelpIcon.click();
      await this.page.waitForTimeout(1000);
      console.log('[AdminActions]    Clicked value-help icon');

      // Search for approver in dialog
      console.log('[AdminActions]   Waiting for dialog...');
      const dialog = this.page.locator('[id$="dialog"][id*="dialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 10000 });
      console.log('[AdminActions]    Dialog visible');

      console.log('[AdminActions]   Filling approver search...');
      const searchField = dialog.locator('[id$="searchField-I"]').first();
      await searchField.fill(approverKeys[i]);
      console.log('[AdminActions]   Clicking search button...');
      await dialog.locator('[id$="searchField-search"]').first().click();
      await this.page.waitForTimeout(1500);
      console.log('[AdminActions]    Searched for approver');

      // Select approver from results
      console.log('[AdminActions]   Looking for approver row...');
      const approverRow = this.page.getByText(approverKeys[i], { exact: true }).first();
      await expect(approverRow).toBeVisible({ timeout: 10000 });
      await approverRow.click();
      await this.page.waitForTimeout(1000);
      console.log(`[AdminActions]    Selected approver: ${approverKeys[i]}`);

      // Click Update button - use icon pattern from codegen: sap-icon://sys-add
      console.log('[AdminActions]   Looking for Update button...');
      const updateBtn = this.page.getByRoleUI5('Button', { icon: 'sap-icon://sys-add' }).first();
      const updateBtnCount = await this.page.getByRoleUI5('Button', { icon: 'sap-icon://sys-add' }).count();
      console.log(`[AdminActions]   Found ${updateBtnCount} sys-add button(s)`);
      await updateBtn.click();
      await this.page.waitForTimeout(1000);
      console.log('[AdminActions]    Clicked Update');

      console.log(`[AdminActions]  Added approver ${approverKeys[i]} with seq ${seq}`);
    }

    // Step 5: Save the configuration - use OverflowToolbarButton with text 'Save'
    const saveBtn = this.page.getByRoleUI5('OverflowToolbarButton', { text: 'Save' }).first();
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    await saveBtn.click();
    await this.page.waitForTimeout(2000);
    console.log('[AdminActions]  Configuration saved');

    // Step 6: Handle "Skip for Now" dialog if appears
    const skipBtn = this.page.getByRoleUI5('Button', { text: 'Skip for Now' });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
      await this.page.waitForTimeout(1000);
      console.log('[AdminActions]  Skipped activation');
    }

    // Step 7: Navigate back using nav-back icon
    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://nav-back' }).click();
    await this.page.waitForTimeout(2000);

    // Step 8: Navigate to Template Settings tab for next phase
    await this.page.getByRoleUI5('StandardListItem', { title: 'Template Settings' }).click();
    await this.page.waitForTimeout(2000);
    console.log(`[AdminActions]  Multi-approver configured: ${approverKeys.length} level(s)`);
  }

  /**
   * Reset multi-approver config - delete row with specific approver key
   * @param approverKey - Approver key to delete (default: 'AUTOBP01B')
   * @param treeNode - Tree node name to select (default: 'ROOT')
   * Based on codegen steps
   */
  async resetMultiApprover(approverKey: string = 'AUTOBP01B', treeNode: string = 'ROOT'): Promise<void> {
    console.log(`[AdminActions] Resetting multi-approver config for ${approverKey}...`);

    // Step1: Navigate to Workflow Settings tab
    await this.page.getByRoleUI5('StandardListItem', { title: 'Workflow Settings' }).click();
    await this.page.waitForTimeout(2000);
    console.log('[AdminActions]  Workflow Settings tab opened');

    // Step2: Navigate to Approval Process tab
    await this.page.getByRoleUI5('StandardListItem', { title: 'Approval Process' }).click();
    await this.page.waitForTimeout(2000);
    console.log('[AdminActions]  Approval Process tab opened');

    // Step3: Select tree node - try multiple locator strategies
    console.log(`[AdminActions] Selecting tree node: ${treeNode}`);
    const treeLocators = [
      () => this.page.getByRoleUI5('StandardListItem', { title: treeNode }),
      () => this.page.locator(`[title="${treeNode}"]`),
      () => this.page.getByText(treeNode),
      () => this.page.locator(`span:has-text("${treeNode}")`),
    ];
    let treeSelected = false;
    for (const getLocator of treeLocators) {
      const el = getLocator();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.click();
        await this.page.waitForTimeout(1000);
        console.log(`[AdminActions]  Tree node "${treeNode}" selected`);
        treeSelected = true;
        break;
      }
    }
    if (!treeSelected) {
      throw new Error(`[AdminActions] Could not find tree node: ${treeNode}`);
    }

    // Step 4: Find and delete row with Approval Level = 20 and Access Sequence = approverKey.
    // The table may still be loading after ROOT is selected, and the row may legitimately
    // not exist (config already clean) — retry briefly, then treat "not found" as success
    // so a defensive reset never fails the test.
    const targetRow = this.page.getByRole('row', { name: new RegExp(`20.*${approverKey}`) });
    let rowFound = false;
    for (let retry = 1; retry <= 5 && !rowFound; retry++) {
      if (await targetRow.isVisible({ timeout: 2000 }).catch(() => false)) {
        rowFound = true;
        break;
      }
      await this.waitForBusy(5000);
      await this.page.waitForTimeout(1000);
    }
    if (!rowFound) {
      console.log(`[AdminActions] No row with Level 20 + ${approverKey} found — already clean, skipping delete`);
      await this.page.getByRoleUI5('Icon', { src: 'sap-icon://nav-back' }).click();
      await this.page.waitForTimeout(2000);
      await this.page.getByRoleUI5('StandardListItem', { title: 'Template Settings' }).click();
      await this.page.waitForTimeout(2000);
      console.log('[AdminActions]  Multi-approver config reset');
      return;
    }
    console.log(`[AdminActions] Found target row with Level 20 and ${approverKey}`);
    
    // Click the Delete Approve Sequence button in this row
    const deleteBtn = targetRow.getByLabel('Delete Approve Sequence');
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();
    await this.page.waitForTimeout(1500);
    console.log(`[AdminActions]  Deleted approver row with Level 20 + ${approverKey}`);

    // Step 5: Save the configuration
    // Wait for Save button to be enabled after row deletion
    const saveBtn = this.page.getByRole('button', { name: 'Save current changes' });
    await expect(saveBtn).toBeEnabled({ timeout: 15000 });
    await saveBtn.click();
    await this.page.waitForTimeout(2000);
    console.log('[AdminActions]  Configuration saved');

    // Step 6: Handle "Skip for Now" dialog if appears
    const skipBtn = this.page.getByRoleUI5('Button', { text: 'Skip for Now' });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
      await this.page.waitForTimeout(1000);
      console.log('[AdminActions]  Skipped activation');
    }

    // Step 7: Navigate back using nav-back icon
    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://nav-back' }).click();
    await this.page.waitForTimeout(2000);

    // Step 8: Navigate to Template Settings tab
    await this.page.getByRoleUI5('StandardListItem', { title: 'Template Settings' }).click();
    await this.page.waitForTimeout(2000);

    console.log('[AdminActions]  Multi-approver config reset');
  }
}

export function createAdminActions(page: Page): AdminActions {
  return new AdminActions(page);
}
