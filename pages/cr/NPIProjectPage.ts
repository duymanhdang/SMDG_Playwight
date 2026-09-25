import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { fillUI5Field, getFieldByLabelText } from '../../helpers/ui';

export class NPIProjectPage extends BasePage {
  readonly searchField: Locator;

  constructor(page: Page) {
    super(page);
    this.searchField = page.getByRoleUI5('SearchField').first();
  }

  // ──────────── Shared Helpers ────────────

  private async clickTab(tabName: string): Promise<void> {
    await this.page.getByRoleUI5('IconTabFilter', { text: tabName }).click({ timeout: 15000 });
    await this.waitForBusy(10000);
  }

  private async searchAndOpenProject(projectId: string, useFirst = false): Promise<void> {
    console.log(`[NPI] Searching for project: ${projectId}...`);
    const sf = useFirst
      ? this.page.getByRoleUI5('SearchField').first()
      : this.page.getByRoleUI5('SearchField');
    await sf.click();
    await sf.fill(projectId);
    await sf.press('Enter');
    await this.waitForBusy(15000);
    await this.page.waitForTimeout(2000);

    console.log(`[NPI] Clicking project link: ${projectId}...`);
    const projectLink = this.page.getByRoleUI5('Link').filter({ hasText: projectId }).first();
    const linkVisible = await projectLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (linkVisible) {
      await projectLink.click();
    } else {
      // Try force click first (handles clones in sap.ui.table)
      console.log('[NPI] Link hidden (clone), trying force click...');
      const forceClicked = await projectLink
        .click({ force: true, timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!forceClicked) {
        // DOM fallback — use link.click() to keep UI5 routing context (avoid window.location.href)
        console.log('[NPI] Force click failed, clicking link via DOM evaluate...');
        const clicked = await this.page.evaluate(pid => {
          const links = document.querySelectorAll<HTMLAnchorElement>('a.sapMLnk');
          for (const link of links) {
            if (link.textContent?.includes(pid) && link.href && link.offsetParent !== null) {
              link.click();
              return true;
            }
          }
          return false;
        }, projectId);
        if (!clicked) throw new Error(`Could not find link for project ${projectId} in DOM`);
      }
    }
    await this.page.waitForTimeout(3000);
    await this.waitForBusy(60000);
  }

  // Click the first VISIBLE overflow ("...") button and dispatch a click on the
  // matching visible menu item. Avoids hidden clones from stale views: on the
  // UI5 registry, a hidden "..." button of an older cached view can precede the
  // visible one, so getByRoleUI5(...).first() may hit the hidden button.
  private async clickOverflowMenuAndDispatch(
    menuItemSubstrings: string[],
    itemLabel: string,
    visibleIndex = 0
  ): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[NPI] Clicking "..." menu button (attempt ${attempt}/3)...`);
      await this.page.keyboard.press('Escape').catch(() => {});
      await this.page.waitForTimeout(500);
      await this.waitForBusy(15000);
      await this.waitForPopupClosed(5000);

      // Real-click the "..." overflow button using its UI5 control role — the exact
      // locator Playwright codegen recorded while manually performing this step
      // (getByRoleUI5('Button', { text: '...' })). Role lookup filters out stale
      // clones of cached views, unlike raw DOM queries.
      const menuBtn = this.page.getByRoleUI5('Button', { text: '...' }).nth(visibleIndex);
      try {
        await menuBtn.click({ timeout: 10000 });
      } catch {
        // Residual overlay / sticky column may block actionability; force the click
        // so UI5 still receives the real mouse events.
        console.log('[NPI] "..." button click blocked, using force click...');
        await menuBtn.click({ force: true, timeout: 10000 });
      }
      await this.page.waitForTimeout(2000);

      // Real-click the matching visible menu item (codegen: getByRoleUI5('MenuItem')).
      // Fall back to the DOM li locator when the role lookup misses (e.g. multi-word
      // items like 'Accept & Submit').
      let menuItem = this.page.getByRoleUI5('MenuItem', { text: itemLabel }).first();

      try {
        await menuItem.click({ timeout: 5000 });
        console.log(`[NPI] "${itemLabel}" menu item clicked`);
        return;
      } catch {
        let domItem = this.page.locator('li.sapUiMnuItm:visible');
        for (const substring of menuItemSubstrings)
          domItem = domItem.filter({ hasText: substring });
        try {
          await domItem.first().click({ timeout: 3000 });
          console.log(`[NPI] "${itemLabel}" menu item clicked (DOM fallback)`);
          return;
        } catch {
          console.log(`[NPI] "${itemLabel}" not ready, closing menu and retrying...`);
          await this.page.keyboard.press('Escape').catch(() => {});
          await this.page.waitForTimeout(500);
        }
      }
    }
    throw new Error(`"${itemLabel}" menu item not found in DOM`);
  }

  protected async navigateToInboxAndOpen(projectId: string): Promise<void> {
    console.log('[NPI] Switching to My Inbox tab...');
    const inboxTab = this.page.getByText('My Inbox').first();
    await expect(inboxTab).toBeVisible({ timeout: 15000 });
    await inboxTab.click();
    await this.waitForBusy(10000);
    console.log('[NPI] Selecting NPI sub-tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'NPI' }).last().click();
    await this.waitForBusy(10000);
    await this.page.waitForTimeout(2000);
    await this.searchAndOpenProject(projectId, true);
  }

  protected async navigateToMyRequestAndOpen(projectId: string): Promise<void> {
    console.log('[NPI] Switching to My Request tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'My Request' }).click();
    await this.waitForBusy(10000);
    console.log('[NPI] Selecting NPI sub-tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'NPI' }).click();
    await this.waitForBusy(10000);
    await this.page.waitForTimeout(2000);
    await this.searchAndOpenProject(projectId, false);
  }

  protected async navigateToActivationAndOpen(projectId: string): Promise<void> {
    console.log('[NPI] Switching to Activation tab...');
    await this.clickTab('Activation');
    console.log('[NPI] Selecting NPI sub-tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'NPI' }).click();
    await this.waitForBusy(10000);
    await this.page.waitForTimeout(2000);
    await this.searchAndOpenProject(projectId, false);
  }

  protected async verifyProjectDetailLoaded(): Promise<void> {
    console.log('[NPI] Verifying project detail page...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Create Product' }).first()).toBeVisible({
      timeout: 60000,
    });
    console.log('[NPI] Opening Create Product section...');
    await this.page.getByRoleUI5('Title', { text: 'Create Product' }).first().click();
  }

  protected async confirmDialog(buttonText = 'Yes'): Promise<void> {
    console.log(`[NPI] Confirmation dialog appeared, clicking ${buttonText}...`);
    await expect(this.page.getByRoleUI5('Title', { text: 'Confirmation' })).toBeVisible();
    await expect(this.page.getByText('This action cannot be undone')).toBeVisible();
    await this.page.getByRoleUI5('Button', { text: buttonText }).click();
  }

  protected async processingDialog(): Promise<void> {
    console.log('[NPI] Processing dialog appeared, clicking OK...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Processing' })).toBeVisible({
      timeout: 15000,
    });
    await expect(this.page.getByText('Multiple items are being')).toBeVisible({ timeout: 10000 });
    await this.page.getByRoleUI5('Button', { text: 'OK' }).click();
  }

  protected async verifyNoData(): Promise<void> {
    console.log('[NPI] Verifying "No data" in item table...');
    await expect(this.page.locator('[id$="idStepItemTable-nodata-text"]')).toBeVisible({
      timeout: 30000,
    });
    console.log('[NPI] "No data" verified');
  }

  protected async fillActivityComment(text: string): Promise<void> {
    console.log('[NPI] Filling comment in Activity section...');
    await this.page.locator('#project-step-comment-input').click();
    await this.page.locator('#project-step-comment-input').fill(text);
    console.log('[NPI] Sending comment...');
    await this.page.locator('[aria-label="paper-plane"]').click();
  }

  async gotoNPITab(): Promise<void> {
    console.log('[NPI] Navigating to NPI tab...');
    await this.navigateTo('My Request');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'NPI' }).first().click();
    await this.waitForBusy(15000);
    console.log('[NPI] NPI tab loaded');
  }

  async createProject(
    projectTemplateName: string,
    description: string,
    priority = 'HIGH'
  ): Promise<void> {
    console.log(`[NPI] Creating new project with template: "${projectTemplateName}"`);

    await this.page.getByRoleUI5('Button', { text: 'New Project' }).click();
    await this.waitForBusy(10000);

    // Wait for dialog to appear and fully load data
    await expect(this.page.getByRoleUI5('Title', { text: 'Project Header' })).toBeVisible({
      timeout: 15000,
    });
    await this.page.waitForTimeout(2000);

    // Select template after Select is loaded (selectedKey ensures items populated)
    await this.page.getByRoleUI5('Select', { selectedKey: 'ADAM_NPI_TESTING' }).click();
    await this.page.waitForTimeout(2000);
    await this.page.getByRoleUI5('Item', { text: projectTemplateName }).click();
    await this.waitForBusy(3000);

    // Select Priority (new required field in version 1.7.0) — ComboBox, choose HIGH
    console.log(`[NPI] Selecting Priority: "${priority}"...`);
    const priorityCombo = this.page.getByRoleUI5('ComboBox', {
      placeholder: 'Select Priority',
    });
    await expect(priorityCombo).toBeVisible({ timeout: 5000 });
    await priorityCombo.click();
    await priorityCombo.fill(priority);
    await this.page.waitForTimeout(500);
    const priorityOpt = this.page.getByRole('option').filter({ hasText: priority }).first();
    const optVisible = await priorityOpt.isVisible({ timeout: 2000 }).catch(() => false);
    if (optVisible) {
      await priorityOpt.click();
    } else {
      await priorityCombo.press('Enter');
    }
    await this.page.waitForTimeout(500);

    // Fill Description
    await fillUI5Field(this.page.getByRoleUI5('TextArea').first(), description);

    await this.page.getByRoleUI5('Button', { text: 'Create' }).click();
    await this.waitForBusy(30000);

    console.log(`[NPI] Project created with description: "${description}"`);
  }

  async searchProjectByDescription(description: string): Promise<string> {
    console.log(`[NPI] Searching project by description...`);

    await this.searchField.click();
    await this.searchField.fill(description);
    await this.searchField.press('Enter');
    await this.waitForBusy(15000);
    await this.page.waitForTimeout(2000);

    // Find project ID link (starts with PRJ) in search results
    const projectLink = this.page.getByRoleUI5('Link').filter({ hasText: /^PRJ/ }).first();
    await expect(projectLink).toBeVisible({ timeout: 15000 });
    const projectId = (await projectLink.textContent()) || '';
    console.log(`[NPI] Found project: ${projectId}`);

    return projectId.trim();
  }

  async openProject(projectId: string): Promise<void> {
    console.log(`[NPI] Opening project: ${projectId}`);
    await this.page.getByRoleUI5('Link', { text: projectId }).click();
    await this.waitForBusy(30000);
  }

  async verifyProjectStatuses(): Promise<void> {
    console.log('[NPI] Verifying project statuses are OPEN...');
    // Use visible-only DOM locator to skip hidden clones (e.g. list table statuses
    // that sort before the detail page statuses in the UI5 control registry).
    const openStatuses = this.page.locator('.sapMObjStatus:visible', { hasText: 'OPEN' });
    await expect(openStatuses.nth(0)).toBeVisible({ timeout: 15000 });
    await expect(openStatuses.nth(1)).toBeVisible({ timeout: 15000 });
    await expect(openStatuses.nth(2)).toBeVisible({ timeout: 15000 });
    console.log('[NPI] All statuses verified: OPEN');
  }

  async addItemViaSearch(
    materialNumber: string,
    itemTemplateName: string,
    expandSection = true
  ): Promise<void> {
    console.log(
      `[NPI] Adding item via search: Material=${materialNumber}, Template=${itemTemplateName}`
    );

    // Click Create Product section to open (skip if already expanded)
    if (expandSection) {
      console.log('[NPI] Clicking Create Product section...');
      await this.page.getByRoleUI5('Title', { text: 'Create Product' }).first().click();
      await this.waitForBusy(10000);
      await this.page.waitForTimeout(2000);
    }

    // Open Add > Search
    console.log('[NPI] Opening Add > Search menu...');
    await this.page.getByRoleUI5('Button', { text: 'Add' }).click();
    await this.page.getByRoleUI5('MenuItem', { text: 'Search' }).click();
    await this.waitForBusy(10000);

    // Wait for Add Item dialog to fully load
    console.log('[NPI] Waiting for Add Item dialog...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Add Item' })).toBeVisible({
      timeout: 15000,
    });
    await this.page.waitForTimeout(2000);

    // Enter material number — find the input inside the dialog via label text
    console.log(`[NPI] Entering material number: ${materialNumber}...`);
    await this.page.waitForTimeout(3000);
    const filled = await this.page.evaluate(matNo => {
      // Find label with text "Material Number", navigate up to <li>, find input
      const labels = document.querySelectorAll('bdi');
      for (const label of labels) {
        if (label.textContent === 'Material Number') {
          const li = label.closest('li.sapMLIB');
          if (!li) continue;
          const inp = li.querySelector('input.sapMInputBaseInner') as HTMLInputElement;
          if (!inp) continue;
          inp.focus();
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          )?.set;
          if (!setter) continue;
          setter.call(inp, matNo);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, materialNumber);
    if (!filled) {
      console.log('[NPI] Dialog input not found via DOM, falling back to UI5 locator...');
      await this.page.getByRoleUI5('Input', { type: 'Text' }).nth(1).click();
      await this.page.getByRoleUI5('Input', { type: 'Text' }).nth(1).fill(materialNumber);
    }
    console.log('[NPI] Clicking Search button...');
    await this.page.getByRoleUI5('Button', { text: 'Search' }).click();
    await this.waitForBusy(15000);

    console.log(`[NPI] Verifying material result: ${materialNumber}...`);
    await expect(this.page.getByText(materialNumber)).toBeVisible({ timeout: 15000 });
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'ACTIVATED' })).toBeVisible({
      timeout: 10000,
    });
    console.log('[NPI] Material found and ACTIVATED');

    // Copy selected item
    console.log('[NPI] Copying selected item...');
    await this.page.getByRoleUI5('Button', { icon: 'sap-icon://copy' }).first().click();
    await this.waitForBusy(10000);
    await this.page.waitForTimeout(2000);

    // Search template
    console.log(`[NPI] Searching template: ${itemTemplateName}...`);
    const templateSearch = this.page.getByRoleUI5('SearchField').filter({ visible: true }).first();
    // The template list reload can spawn a fresh BusyIndicator/blocklayer right after
    // the material copy; click retries to let it clear (flaky guard).
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await templateSearch.click({ timeout: 10000 });
        break;
      } catch {
        console.log(`[NPI] Template search click blocked (attempt ${attempt}/3), waiting for busy...`);
        await this.waitForBusy(10000);
        await this.waitForPopupClosed(5000);
        await this.page.waitForTimeout(1000);
        if (attempt === 3) throw new Error('Template search field could not be clicked');
      }
    }
    await templateSearch.fill(itemTemplateName);
    await templateSearch.press('Enter');
    await this.waitForBusy(5000);

    // Select template
    console.log(`[NPI] Selecting template: ${itemTemplateName}...`);
    await this.page
      .getByRoleUI5('ColumnListItem')
      .filter({ hasText: itemTemplateName })
      .first()
      .click();
    await this.waitForBusy(15000);
    await this.page.waitForTimeout(2000);

    // Wait for form to load
    console.log('[NPI] Waiting for form to load...');
    await expect(
      this.page.getByRoleUI5('Label', { text: 'Material Number' }).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 60000 });

    console.log('[NPI] Item added successfully, form loaded');
  }

  async fillCRHeader(params: {
    description: string;
    priority: string;
    reason: string;
    otherReason: string;
  }): Promise<void> {
    console.log('[NPI] Filling CR header fields...');

    // Description — stable control ID (matches MyRequestPage pattern)
    await fillUI5Field(this.page.locator('[id$="--idRqDescInput"]'), params.description);
    console.log(`[NPI] Filled Description: "${params.description}"`);
    await this.page.waitForTimeout(2000);

    // Priority — click the Select by its control ID, then pick target item
    await this.page.locator('[id$="idPriorityCombo"]').click();
    await this.page.waitForTimeout(1000);
    await this.page.getByRoleUI5('Item', { text: params.priority }).first().click();
    console.log(`[NPI] Selected Priority: ${params.priority}`);
    await this.page.waitForTimeout(1000);

    // Reason — click the Select by its control ID, then pick target item
    await this.page.locator('[id$="idReasonCombo"]').click();
    await this.page.waitForTimeout(1000);
    await this.page.getByRoleUI5('Item', { text: params.reason }).last().click();
    console.log(`[NPI] Selected Reason: ${params.reason}`);
    await this.page.waitForTimeout(1000);

    // Other Reason — use fillUI5Field to handle UI5 TextArea div
    await fillUI5Field(
      getFieldByLabelText(this.page, 'Other reason', 'textarea'),
      params.otherReason
    );
    console.log(`[NPI] Filled Other Reason: "${params.otherReason}"`);
  }

  async verifyItemStatus(status: string): Promise<void> {
    console.log(`[NPI] Verifying item status: "${status}"`);
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: status })).toBeVisible({
      timeout: 30000,
    });
    console.log(`[NPI] Item status verified: "${status}"`);
  }

  async approveProjectItem(
    projectId: string,
    comment: string,
    preApproveStatus = 'SUBMITTED'
  ): Promise<void> {
    console.log(`[NPI] Approver approving project item: ${projectId}`);

    await this.navigateToInboxAndOpen(projectId);
    await this.verifyProjectDetailLoaded();

    // Verify item status before approving
    console.log(`[NPI] Verifying ${preApproveStatus} status...`);
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: preApproveStatus })).toBeVisible();
    console.log(`[NPI] Status verified: ${preApproveStatus}`);

    // Click Approve
    console.log('[NPI] Clicking Approve button...');
    await this.page.getByRoleUI5('Button', { text: 'Approve' }).click();

    await this.confirmDialog('Yes');
    await this.processingDialog();
    await this.verifyNoData();

    // Click History tab to verify APPROVED status
    console.log('[NPI] Clicking History tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'History' }).click();
    await this.waitForBusy(10000);
    console.log('[NPI] Verifying APPROVED status in History...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'APPROVED' })).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] APPROVED status verified');

    await this.fillActivityComment(comment);
    console.log(`[NPI] Project item approved: ${projectId}`);
  }

  async approverReworkProjectItem(
    projectId: string,
    comment: string,
    preReworkStatus = 'SUBMITTED'
  ): Promise<void> {
    console.log(`[NPI] Approver reworking project item: ${projectId}`);

    await this.navigateToInboxAndOpen(projectId);
    await this.verifyProjectDetailLoaded();

    // Verify item status before rework
    console.log(`[NPI] Verifying ${preReworkStatus} status...`);
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: preReworkStatus })).toBeVisible();
    console.log(`[NPI] Status verified: ${preReworkStatus}`);

    // Click Rework button
    console.log('[NPI] Clicking Rework button...');
    await this.page.getByRoleUI5('Button', { text: 'Rework' }).last().click();

    await this.confirmDialog('Yes');
    await this.processingDialog();
    await this.verifyNoData();

    // Click History tab to verify REWORK status
    console.log('[NPI] Clicking History tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'History' }).click();
    await this.waitForBusy(10000);
    console.log('[NPI] Verifying REWORK status in History...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'REWORK' })).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] REWORK status verified');

    await this.fillActivityComment(comment);
    console.log(`[NPI] Project item reworked: ${projectId}`);
  }

  async stewardReworkProjectItem(projectId: string, comment: string): Promise<void> {
    console.log(`[NPI] Steward reworking project item: ${projectId}`);

    await this.navigateToActivationAndOpen(projectId);
    await this.verifyProjectDetailLoaded();

    // Click Assign to me
    console.log('[NPI] Clicking Assign to me...');
    await this.page.getByRoleUI5('Button', { text: 'Assign to me' }).click();

    await this.confirmDialog('Yes');
    await this.verifyNoData();

    // Click Assigned tab and verify ASSIGNED
    console.log('[NPI] Clicking Assigned tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Assigned' }).nth(1).click();
    await this.waitForBusy(10000);
    console.log('[NPI] Verifying ASSIGNED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'ASSIGNED' }).first()).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] ASSIGNED status verified');

    // Click Rework button
    console.log('[NPI] Clicking Rework button...');
    await this.page.getByRoleUI5('Button', { text: 'Rework' }).last().click();

    await this.confirmDialog('Yes');
    await this.processingDialog();
    await this.verifyNoData();

    await this.fillActivityComment(comment);
    console.log(`[NPI] Project item reworked by Steward: ${projectId}`);
  }

  async approveProjectItemQuick(projectId: string): Promise<void> {
    console.log(`[NPI] Approver approving project item (quick, multi-level): ${projectId}`);

    await this.navigateToInboxAndOpen(projectId);
    await this.verifyProjectDetailLoaded();

    // Verify item status before approving
    console.log('[NPI] Verifying SUBMITTED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'SUBMITTED' })).toBeVisible();
    console.log('[NPI] Status verified: SUBMITTED');

    // Click Approve
    console.log('[NPI] Clicking Approve button...');
    await this.page.getByRoleUI5('Button', { text: 'Approve' }).click();

    await this.confirmDialog('Yes');
    await this.processingDialog();
    await this.verifyNoData();

    console.log(`[NPI] Project item approved (quick): ${projectId}`);
  }

  async activateProjectItem(
    projectId: string,
    crNumber: string,
    comment: string,
    skipAssign = false
  ): Promise<void> {
    console.log(`[NPI] Steward activating project item: ${projectId}`);

    await this.navigateToActivationAndOpen(projectId);
    await this.verifyProjectDetailLoaded();

    if (!skipAssign) {
      // Verify CR link — handle hidden clones
      console.log(`[NPI] Verifying CR link: ${crNumber}...`);
      const crLink = this.page.getByRoleUI5('Link', { text: crNumber }).first();
      const crLinkVisible = await crLink.isVisible({ timeout: 5000 }).catch(() => false);
      if (!crLinkVisible) {
        console.log('[NPI] CR link hidden (clone), checking DOM...');
        const crFound = await this.page.evaluate(cr => {
          const links = document.querySelectorAll<HTMLAnchorElement>('a.sapMLnk');
          for (const link of links) {
            if (link.textContent?.includes(cr)) return true;
          }
          return false;
        }, crNumber);
        if (!crFound) throw new Error(`CR link ${crNumber} not found in DOM`);
      }
      console.log('[NPI] CR link verified');

      // Click Assign to me button
      console.log('[NPI] Clicking Assign to me...');
      await this.page.getByRoleUI5('Button', { text: 'Assign to me' }).click();

      await this.confirmDialog('Yes');
      await this.verifyNoData();
    }

    // Click Assigned tab and verify ASSIGNED
    console.log('[NPI] Clicking Assigned tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Assigned' }).nth(1).click();
    await this.waitForBusy(10000);
    console.log('[NPI] Verifying ASSIGNED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'ASSIGNED' }).first()).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] ASSIGNED status verified');

    // Click Approve button
    console.log('[NPI] Clicking Approve...');
    await this.page.getByRoleUI5('Button', { text: 'Approve' }).click();

    await this.confirmDialog('Yes');
    await this.processingDialog();
    await this.verifyNoData();

    // Click Activated tab and verify ACTIVATED
    console.log('[NPI] Clicking Activated tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Activated' }).click();
    await this.waitForBusy(10000);
    console.log('[NPI] Verifying ACTIVATED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'ACTIVATED' })).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] ACTIVATED status verified');

    await this.fillActivityComment(comment);
    console.log(`[NPI] Project item activated: ${projectId}`);
  }

  async stewardRejectProjectItem(
    projectId: string,
    crNumber: string,
    comment: string
  ): Promise<void> {
    console.log(`[NPI] Steward rejecting project item: ${projectId}`);

    await this.navigateToActivationAndOpen(projectId);
    await this.verifyProjectDetailLoaded();

    // Verify CR link — handle hidden clones
    console.log(`[NPI] Verifying CR link: ${crNumber}...`);
    const crLink = this.page.getByRoleUI5('Link', { text: crNumber }).first();
    const crLinkVisible = await crLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!crLinkVisible) {
      console.log('[NPI] CR link hidden (clone), checking DOM...');
      const crFound = await this.page.evaluate(cr => {
        const links = document.querySelectorAll<HTMLAnchorElement>('a.sapMLnk');
        for (const link of links) {
          if (link.textContent?.includes(cr)) return true;
        }
        return false;
      }, crNumber);
      if (!crFound) throw new Error(`CR link ${crNumber} not found in DOM`);
    }
    console.log('[NPI] CR link verified');

    // Click Assign to me button
    console.log('[NPI] Clicking Assign to me...');
    await this.page.getByRoleUI5('Button', { text: 'Assign to me' }).click();

    await this.confirmDialog('Yes');
    await this.verifyNoData();

    // Click Assigned tab and verify ASSIGNED
    console.log('[NPI] Clicking Assigned tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Assigned' }).nth(1).click();
    await this.waitForBusy(10000);
    console.log('[NPI] Verifying ASSIGNED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'ASSIGNED' }).first()).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] ASSIGNED status verified');

    // Click Reject button
    console.log('[NPI] Clicking Reject...');
    await this.page.getByRoleUI5('Button', { text: 'Reject' }).click();

    await this.confirmDialog('Yes');
    await this.processingDialog();
    await this.verifyNoData();

    // Click Rejected tab and verify REJECTED
    console.log('[NPI] Clicking Rejected tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Rejected' }).click();
    await this.waitForBusy(10000);
    console.log('[NPI] Verifying REJECTED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'REJECTED' }).first()).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] REJECTED status verified');

    await this.fillActivityComment(comment);
    console.log(`[NPI] Project item rejected by Steward: ${projectId}`);
  }

  async closeProject(projectId: string, comment: string): Promise<void> {
    console.log(`[NPI] Requestor closing project: ${projectId}`);

    // Verify ACTIVATED status
    console.log('[NPI] Verifying ACTIVATED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'ACTIVATED' })).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] ACTIVATED status verified');

    // Click Close Step
    console.log('[NPI] Clicking Close Step...');
    await this.page.getByRoleUI5('Button', { text: 'Close Step' }).click();

    await this.confirmDialog('OK');

    // Verify CLOSED statuses
    console.log('[NPI] Verifying CLOSED statuses...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'CLOSED' }).nth(1)).toBeVisible({
      timeout: 15000,
    });
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'CLOSED' }).nth(2)).toBeVisible({
      timeout: 15000,
    });
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'CLOSED' }).nth(3)).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] CLOSED statuses verified');

    await this.fillActivityComment(comment);
    await this.page.waitForTimeout(2000);

    // Navigate to My Request > NPI and search project to verify CLOSED
    console.log('[NPI] Navigating to My Request > NPI...');
    await this.clickTab('My Request');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'NPI' }).click();
    await this.waitForBusy(10000);

    console.log(`[NPI] Searching for project: ${projectId}...`);
    await this.page.getByRoleUI5('SearchField').first().click();
    await this.page.getByRoleUI5('SearchField').first().fill(projectId);
    await this.page.getByRoleUI5('SearchField').first().press('Enter');
    await this.waitForBusy(15000);
    await this.page.waitForTimeout(2000);

    console.log('[NPI] Verifying CLOSED status in search results...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'CLOSED' }).first()).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] CLOSED status verified in search results');

    console.log(`[NPI] Project closed: ${projectId}`);
  }

  async rejectProjectItem(projectId: string, rejectComment: string): Promise<void> {
    console.log(`[NPI] Approver rejecting project item: ${projectId}`);

    // Navigate to My Inbox > NPI — keep inline due to retry logic
    console.log('[NPI] Switching to My Inbox tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'My Inbox' }).first().click();
    await this.waitForBusy(10000);
    console.log('[NPI] Selecting NPI sub-tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'NPI' }).last().click();
    await this.waitForBusy(10000);
    await this.page.waitForTimeout(2000);

    // Search by project ID
    console.log(`[NPI] Searching for project: ${projectId}...`);
    await this.page.getByRoleUI5('SearchField').first().click();
    await this.page.getByRoleUI5('SearchField').first().fill(projectId);
    await this.page.getByRoleUI5('SearchField').first().press('Enter');
    await this.waitForBusy(15000);
    await this.page.waitForTimeout(3000);

    // Click project link — try multiple locator strategies
    console.log(`[NPI] Clicking project link: ${projectId}...`);
    let projectLink = this.page.getByRoleUI5('Link').filter({ hasText: projectId }).first();
    let linkVisible = await projectLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!linkVisible) {
      console.log('[NPI] UI5 Link not found, trying raw <a> locator...');
      projectLink = this.page.locator('a').filter({ hasText: projectId }).first();
      linkVisible = await projectLink.isVisible({ timeout: 5000 }).catch(() => false);
    }
    if (!linkVisible) {
      console.log('[NPI] Link still not found, re-searching...');
      await this.page.getByRoleUI5('SearchField').first().click();
      await this.page.getByRoleUI5('SearchField').first().fill(projectId);
      await this.page.getByRoleUI5('SearchField').first().press('Enter');
      await this.waitForBusy(15000);
      await this.page.waitForTimeout(3000);
      projectLink = this.page.getByRoleUI5('Link').filter({ hasText: projectId }).first();
      linkVisible = await projectLink.isVisible({ timeout: 5000 }).catch(() => false);
    }
    if (!linkVisible) {
      console.log('[NPI] Link hidden (clone), clicking link via DOM evaluate...');
      const clicked = await this.page.evaluate(pid => {
        const links = document.querySelectorAll<HTMLAnchorElement>('a.sapMLnk');
        for (const link of links) {
          if (link.textContent?.includes(pid) && link.href && link.offsetParent !== null) {
            link.click();
            return true;
          }
        }
        return false;
      }, projectId);
      if (!clicked) throw new Error(`Could not find link for project ${projectId} in DOM`);
      await this.page.waitForTimeout(3000);
      await this.waitForBusy(60000);
    } else {
      await expect(projectLink).toBeVisible({ timeout: 10000 });
      await projectLink.click();
      await this.page.waitForTimeout(3000);
      await this.waitForBusy(60000);
    }

    await this.verifyProjectDetailLoaded();

    // Verify SUBMITTED status before rejecting
    console.log('[NPI] Verifying SUBMITTED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'SUBMITTED' })).toBeVisible();
    console.log('[NPI] Status verified: SUBMITTED');

    // Click Reject
    console.log('[NPI] Clicking Reject button...');
    await this.page.getByRoleUI5('Button', { text: 'Reject' }).click();

    await this.confirmDialog('Yes');
    await this.processingDialog();
    await this.verifyNoData();

    // Click History tab to verify REJECTED status
    console.log('[NPI] Clicking History tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'History' }).click();
    await this.waitForBusy(10000);
    console.log('[NPI] Verifying REJECTED status in History...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'REJECTED' })).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] REJECTED status verified');

    await this.fillActivityComment(rejectComment);
    console.log(`[NPI] Project item rejected: ${projectId}`);
  }

  async resubmitProjectItem(projectId: string, newDescription: string): Promise<void> {
    console.log(`[NPI] Requestor resubmitting project item: ${projectId}`);

    // Verify REJECTED status on project detail page
    console.log('[NPI] Verifying REJECTED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'REJECTED' })).toBeVisible({
      timeout: 30000,
    });
    console.log('[NPI] REJECTED status verified');

    // Open the edit form and wait for it to load. Retry in case the app fails
    // to open it (the "..." → Resubmit action occasionally doesn't render).
    const editFormLoaded = async (): Promise<boolean> => {
      try {
        await expect(
          this.page
            .getByRoleUI5('Label', { text: 'Material Number' })
            .filter({ visible: true })
            .first()
        ).toBeVisible({ timeout: 20000 });
        return true;
      } catch {
        return false;
      }
    };

    let loaded = false;
    for (let attempt = 1; attempt <= 3 && !loaded; attempt++) {
      console.log(`[NPI] Opening edit form (attempt ${attempt}/3)...`);
      await this.clickOverflowMenuAndDispatch(['Resubmit'], 'Resubmit');
      loaded = await editFormLoaded();
      if (!loaded) {
        console.log('[NPI] Edit form did not load, closing and retrying...');
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.page.waitForTimeout(1000);
      }
    }
    if (!loaded) {
      throw new Error(`Edit form did not load for project ${projectId} after 3 attempts`);
    }
    console.log('[NPI] Edit form loaded');

    // Update Description
    console.log('[NPI] Updating Description...');
    await fillUI5Field(this.page.locator('[id$="--idRqDescInput"]'), newDescription);
    console.log(`[NPI] Description updated: "${newDescription}"`);

    console.log(`[NPI] Ready to resubmit: ${projectId}`);
  }

  async editProjectItem(projectId: string, newDescription: string): Promise<void> {
    console.log(`[NPI] Requestor editing project item: ${projectId}`);

    // The requestor's page is still on the project detail from creation; wait for
    // the status to refresh (now REWORK after Steward/Approver rework) — the app
    // updates it via UI5 data binding, no reload needed.
    console.log('[NPI] Verifying REWORK status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'REWORK' })).toBeVisible({
      timeout: 30000,
    });
    console.log('[NPI] REWORK status verified');

    // Click "..." menu button and select Edit (visible-locator, avoids hidden clones)
    await this.clickOverflowMenuAndDispatch(['Edit'], 'Edit');

    // Wait for edit form to load (look for Material Number label)
    console.log('[NPI] Waiting for edit form to load...');
    await this.waitForBusy(30000);
    await expect(
      this.page.getByRoleUI5('Label', { text: 'Material Number' }).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 60000 });
    console.log('[NPI] Edit form loaded');

    // Update Description
    console.log('[NPI] Updating Description...');
    await fillUI5Field(this.page.locator('[id$="--idRqDescInput"]'), newDescription);
    console.log(`[NPI] Description updated: "${newDescription}"`);

    console.log(`[NPI] Ready to re-submit: ${projectId}`);
  }

  async acceptDuplicateAndSubmit(projectId: string, comment?: string): Promise<void> {
    console.log(`[NPI] Requestor accepting duplicate for project: ${projectId}`);

    // Verify DUPLICATE status
    console.log('[NPI] Verifying DUPLICATE status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'DUPLICATE' })).toBeVisible({
      timeout: 30000,
    });
    console.log('[NPI] DUPLICATE status verified');

    // Click "..." menu button and select "Accept & Submit" (visible-locator, avoids hidden clones)
    await this.clickOverflowMenuAndDispatch(['Accept', 'Submit'], 'Accept & Submit');

    // Confirmation dialog → OK (no textarea dialog after, status changes to SUBMITTED directly)
    await this.page.waitForTimeout(1500);
    console.log('[NPI] Confirmation dialog appeared, clicking OK...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Confirmation' })).toBeVisible({
      timeout: 10000,
    });
    await this.page.getByRoleUI5('Button', { text: 'OK' }).click();
    await this.waitForBusy(10000);
    await this.page.waitForTimeout(2000);

    // Verify SUBMITTED status
    console.log('[NPI] Verifying SUBMITTED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'SUBMITTED' })).toBeVisible({
      timeout: 30000,
    });
    console.log('[NPI] SUBMITTED status verified');
  }

  async approveProjectItemWithDuplicate(
    projectId: string,
    comment: string,
    preStatus = 'SUBMITTED'
  ): Promise<void> {
    console.log(`[NPI] Approver approving with duplicate: ${projectId}`);

    // Wait for page to fully load after login before switching tabs
    await this.page.waitForTimeout(3000);

    await this.navigateToInboxAndOpen(projectId);
    await this.verifyProjectDetailLoaded();

    // Verify item status before approving
    console.log(`[NPI] Verifying ${preStatus} status...`);
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: preStatus })).toBeVisible();
    console.log(`[NPI] Status verified: ${preStatus}`);

    // Click Approve
    console.log('[NPI] Clicking Approve button...');
    await this.page.getByRoleUI5('Button', { text: 'Approve' }).click();

    // Confirmation dialog
    console.log('[NPI] Confirmation dialog appeared, clicking Yes...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Confirmation' })).toBeVisible();
    await this.page.getByRoleUI5('Button', { text: 'Yes' }).click();

    // Processing dialog
    console.log('[NPI] Processing dialog appeared, clicking OK...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Processing' })).toBeVisible();
    await this.page.getByRoleUI5('Button', { text: 'OK' }).click();
    await this.waitForBusy(10000);

    // Click Duplicate tab and retry until DUPLICATE status appears
    console.log('[NPI] Clicking Duplicate tab and polling for DUPLICATE status...');
    const duplicateIconTab = this.page.getByRoleUI5('IconTabFilter', { text: 'Duplicate' });
    let duplicateFound = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`[NPI] Duplicate tab attempt ${attempt}/5...`);
      await duplicateIconTab.click();
      await this.waitForBusy(10000);
      if (
        await this.page
          .getByRoleUI5('ObjectStatus', { text: 'DUPLICATE' })
          .first()
          .isVisible({ timeout: 5000 })
          .catch(() => false)
      ) {
        duplicateFound = true;
        break;
      }
      console.log(`[NPI] DUPLICATE not yet visible, waiting 3s before retry...`);
      await this.page.waitForTimeout(3000);
    }
    if (!duplicateFound) {
      console.log('[NPI] DUPLICATE never appeared after 5 attempts, asserting final time...');
      await expect(
        this.page.getByRoleUI5('ObjectStatus', { text: 'DUPLICATE' }).first()
      ).toBeVisible({ timeout: 15000 });
    }
    console.log('[NPI] DUPLICATE status verified');

    // Click Accept & Approve
    console.log('[NPI] Clicking Accept & Approve...');
    await this.page.getByRoleUI5('Button', { text: 'Accept & Approve' }).click();
    await this.page.waitForTimeout(1500);

    // Confirmation dialog
    await this.page.waitForTimeout(1500);
    console.log('[NPI] Confirmation dialog appeared, clicking Yes...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Confirmation' })).toBeVisible({
      timeout: 10000,
    });
    await this.page.getByRoleUI5('Button', { text: 'Yes' }).click();
    await this.page.waitForTimeout(1500);

    // Processing dialog
    console.log('[NPI] Processing dialog appeared, clicking OK...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Processing' })).toBeVisible({
      timeout: 10000,
    });
    await this.page.getByRoleUI5('Button', { text: 'OK' }).click();
    await this.waitForBusy(10000);

    // Click History tab and retry until APPROVED status appears
    console.log('[NPI] Clicking History tab and polling for APPROVED status...');
    const historyIconTab = this.page.getByRoleUI5('IconTabFilter', { text: 'History' });
    let approvedFound = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`[NPI] History tab attempt ${attempt}/5...`);
      await historyIconTab.click();
      await this.waitForBusy(10000);
      if (
        await this.page
          .getByRoleUI5('ObjectStatus', { text: 'APPROVED' })
          .isVisible({ timeout: 5000 })
          .catch(() => false)
      ) {
        approvedFound = true;
        break;
      }
      console.log(`[NPI] APPROVED not yet visible, waiting 3s before retry...`);
      await this.page.waitForTimeout(3000);
    }
    if (!approvedFound) {
      console.log('[NPI] APPROVED never appeared after 5 attempts, asserting final time...');
      await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'APPROVED' })).toBeVisible({
        timeout: 15000,
      });
    }
    console.log('[NPI] APPROVED status verified');

    // Send comment in Activity section
    console.log('[NPI] Sending comment in Activity section...');
    await this.page.locator('#project-step-comment-input').click();
    await this.page.locator('#project-step-comment-input').fill(comment);
    await this.page.locator('[aria-label="paper-plane"]').click();

    console.log(`[NPI] Project item approved with duplicate: ${projectId}`);
  }

  async activateProjectItemWithDuplicate(
    projectId: string,
    crNumber: string,
    comment: string
  ): Promise<void> {
    console.log(`[NPI] Steward activating with duplicate: ${projectId}`);

    // Wait for page to fully load after login before switching tabs
    await this.page.waitForTimeout(3000);

    await this.navigateToActivationAndOpen(projectId);
    await this.verifyProjectDetailLoaded();

    // Verify CR link — handle hidden clones
    console.log(`[NPI] Verifying CR link: ${crNumber}...`);
    const crLink = this.page.getByRoleUI5('Link', { text: crNumber }).first();
    const crLinkVisible = await crLink.isVisible({ timeout: 5000 }).catch(() => false);
    if (!crLinkVisible) {
      console.log('[NPI] CR link hidden (clone), checking DOM...');
      const crFound = await this.page.evaluate(cr => {
        const links = document.querySelectorAll<HTMLAnchorElement>('a.sapMLnk');
        for (const link of links) {
          if (link.textContent?.includes(cr)) return true;
        }
        return false;
      }, crNumber);
      if (!crFound) throw new Error(`CR link ${crNumber} not found in DOM`);
    }
    console.log('[NPI] CR link verified');

    // Click Assign to me button
    console.log('[NPI] Clicking Assign to me...');
    await this.page.getByRoleUI5('Button', { text: 'Assign to me' }).click();

    // Confirmation dialog
    console.log('[NPI] Confirmation dialog appeared, clicking Yes...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Confirmation' })).toBeVisible();
    await this.page.getByRoleUI5('Button', { text: 'Yes' }).click();

    // Verify No data
    console.log('[NPI] Verifying "No data" in item table...');
    await expect(this.page.locator('[id$="idStepItemTable-nodata-text"]')).toBeVisible({
      timeout: 30000,
    });
    console.log('[NPI] "No data" verified');

    // Click Assigned tab and verify ASSIGNED
    console.log('[NPI] Clicking Assigned tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Assigned' }).nth(1).click();
    await this.waitForBusy(10000);
    console.log('[NPI] Verifying ASSIGNED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'ASSIGNED' }).first()).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] ASSIGNED status verified');

    // Click Approve
    console.log('[NPI] Clicking Approve...');
    await this.page.getByRoleUI5('Button', { text: 'Approve' }).click();

    // Confirmation dialog
    console.log('[NPI] Confirmation dialog appeared, clicking Yes...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Confirmation' })).toBeVisible();
    await this.page.getByRoleUI5('Button', { text: 'Yes' }).click();

    // Processing dialog
    console.log('[NPI] Processing dialog appeared, clicking OK...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Processing' })).toBeVisible();
    await this.page.getByRoleUI5('Button', { text: 'OK' }).click();
    await this.waitForBusy(10000);

    // Click Duplicate tab and retry until DUPLICATE status appears (activate flow)
    console.log('[NPI] Clicking Duplicate tab and polling for DUPLICATE status...');
    const duplicateIconTab = this.page.getByRoleUI5('IconTabFilter', { text: 'Duplicate' });
    let duplicateFound = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`[NPI] Duplicate tab attempt ${attempt}/5...`);
      await duplicateIconTab.click();
      await this.waitForBusy(10000);
      if (
        await this.page
          .getByRoleUI5('ObjectStatus', { text: 'DUPLICATE' })
          .first()
          .isVisible({ timeout: 5000 })
          .catch(() => false)
      ) {
        duplicateFound = true;
        break;
      }
      console.log(`[NPI] DUPLICATE not yet visible, waiting 3s before retry...`);
      await this.page.waitForTimeout(3000);
    }
    if (!duplicateFound) {
      console.log('[NPI] DUPLICATE never appeared after 5 attempts, asserting final time...');
      await expect(
        this.page.getByRoleUI5('ObjectStatus', { text: 'DUPLICATE' }).first()
      ).toBeVisible({ timeout: 15000 });
    }
    console.log('[NPI] DUPLICATE status verified');

    // Click Accept & Approve
    console.log('[NPI] Clicking Accept & Approve...');
    await this.page.getByRoleUI5('Button', { text: 'Accept & Approve' }).click();
    await this.page.waitForTimeout(1500);

    // Confirmation dialog
    await this.page.waitForTimeout(1500);
    console.log('[NPI] Confirmation dialog appeared, clicking Yes...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Confirmation' })).toBeVisible({
      timeout: 10000,
    });
    await this.page.getByRoleUI5('Button', { text: 'Yes' }).click();
    await this.page.waitForTimeout(1500);

    // Processing dialog
    console.log('[NPI] Processing dialog appeared, clicking OK...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Processing' })).toBeVisible({
      timeout: 10000,
    });
    await this.page.getByRoleUI5('Button', { text: 'OK' }).click();
    await this.waitForBusy(10000);

    // Click Activated tab and retry until ACTIVATED status appears
    console.log('[NPI] Clicking Activated tab and polling for ACTIVATED status...');
    const activatedIconTab = this.page.getByRoleUI5('IconTabFilter', { text: 'Activated' });
    let activatedFound = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`[NPI] Activated tab attempt ${attempt}/5...`);
      await activatedIconTab.click();
      await this.waitForBusy(10000);
      if (
        await this.page
          .getByRoleUI5('ObjectStatus', { text: 'ACTIVATED' })
          .isVisible({ timeout: 5000 })
          .catch(() => false)
      ) {
        activatedFound = true;
        break;
      }
      console.log(`[NPI] ACTIVATED not yet visible, waiting 3s before retry...`);
      await this.page.waitForTimeout(3000);
    }
    if (!activatedFound) {
      console.log('[NPI] ACTIVATED never appeared after 5 attempts, asserting final time...');
      await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'ACTIVATED' })).toBeVisible({
        timeout: 15000,
      });
    }
    console.log('[NPI] ACTIVATED status verified');

    // Fill comment in Activity section
    console.log('[NPI] Sending comment in Activity section...');
    await this.page.locator('#project-step-comment-input').click();
    await this.page.locator('#project-step-comment-input').fill(comment);
    await this.page.locator('[aria-label="paper-plane"]').click();

    console.log(`[NPI] Project item activated with duplicate: ${projectId}`);
  }

  async cancelProjectItem(rowIndex = 0, comment?: string): Promise<void> {
    console.log('[NPI] Cancelling project item via "..." menu...');

    // Verify SUBMITTED status first — use .first() to handle clones
    console.log('[NPI] Verifying SUBMITTED status before cancel...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'SUBMITTED' }).first()).toBeVisible(
      { timeout: 30000 }
    );
    console.log('[NPI] SUBMITTED status verified');

    // Wait for page to fully reload after SUBMITTED status update
    console.log('[NPI] Waiting for page reload after status update...');
    await this.page.waitForTimeout(5000);

    // Click "..." menu button and select Cancel (visible-locator, avoids hidden clones)
    console.log(`[NPI] Clicking "..." menu button for row ${rowIndex}...`);
    await this.clickOverflowMenuAndDispatch(['Cancel'], 'Cancel', rowIndex);
    await this.page.waitForTimeout(1500);

    // Comments dialog → fill reason → Confirm
    console.log('[NPI] Comments dialog appeared, filling reason and confirming...');
    const dialog = this.page.locator('.sapMDialog').last();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const reasonTextarea = dialog.locator('textarea');
    await expect(reasonTextarea).toBeVisible({ timeout: 5000 });
    await reasonTextarea.click();
    await reasonTextarea.fill(comment || 'Cancel project item');
    await dialog.getByRoleUI5('Button', { text: 'Confirm' }).click();
    await this.page.waitForTimeout(2000);

    // Verify CANCELLED status — use .first() because multiple items may show CANCELLED
    console.log('[NPI] Verifying CANCELLED status...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'CANCELLED' }).first()).toBeVisible(
      { timeout: 30000 }
    );
    console.log('[NPI] CANCELLED status verified');

    // Fill comment in Activity section if provided
    if (comment) {
      await this.fillActivityComment(comment);
      await this.page.waitForTimeout(2000);
    }
  }

  async closeProjectAfterCancel(projectId: string, comment: string): Promise<void> {
    console.log(`[NPI] Closing project after cancel: ${projectId}`);

    // Click Close Step
    console.log('[NPI] Clicking Close Step...');
    await this.page.getByRoleUI5('Button', { text: 'Close Step' }).click();

    await this.confirmDialog('OK');
    await this.waitForBusy(10000);

    // Verify CLOSED statuses
    console.log('[NPI] Verifying CLOSED statuses...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'CLOSED' }).first()).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] CLOSED statuses verified');

    await this.fillActivityComment(comment);
    await this.page.waitForTimeout(2000);

    // Navigate to My Request > NPI and search project to verify CLOSED
    console.log('[NPI] Navigating to My Request > NPI...');
    await this.clickTab('My Request');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'NPI' }).click();
    await this.waitForBusy(10000);

    console.log(`[NPI] Searching for project: ${projectId}...`);
    await this.page.getByRoleUI5('SearchField').first().click();
    await this.page.getByRoleUI5('SearchField').first().fill(projectId);
    await this.page.getByRoleUI5('SearchField').first().press('Enter');
    await this.waitForBusy(15000);
    await this.page.waitForTimeout(2000);

    console.log('[NPI] Verifying CLOSED status in search results...');
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'CLOSED' }).first()).toBeVisible({
      timeout: 15000,
    });
    console.log('[NPI] CLOSED status verified in search results');

    console.log(`[NPI] Project closed after cancel: ${projectId}`);
  }
}
