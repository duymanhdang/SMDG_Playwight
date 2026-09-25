import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { fillUI5Field, getFieldByLabelText } from '../../helpers/ui';
import { searchAndClick } from '../../helpers/search';
import { submitCRWithConfirm } from '../../helpers/workflow';

export class CopyRequestForm extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async fillDescription(value: string): Promise<void> {
    console.log(`[CopyRequestForm] Filling Description: "${value}"`);
    await fillUI5Field(
      this.page.getByRoleUI5('TextArea', { valueStateText: 'Please fill out Description' }),
      value
    );
  }

  async selectPriority(priority: string): Promise<void> {
    console.log(`[CopyRequestForm] Selecting Priority: ${priority}`);
    await this.page
      .getByRoleUI5('Select', {
        valueStateText: 'Please fill out Priority',
      })
      .click();
    await this.page.getByRoleUI5('Item', { text: priority }).click();
  }

  async selectTemplate(templateKey: string, templateName: string): Promise<void> {
    console.log(`[CopyRequestForm] Selecting Template: ${templateName}`);
    await this.page.waitForTimeout(3000);

    // Click template dropdown using UI5 Select with selectedKey
    const select = this.page.getByRoleUI5('Select', { selectedKey: templateKey });
    await expect(select).toBeVisible({ timeout: 15000 });
    await select.click();
    console.log('[CopyRequestForm]  Template dropdown clicked');

    // Wait for dropdown list to appear
    await this.page.waitForTimeout(2000);

    // Select template from dropdown - use getByRoleUI5('Item') for SAPUI5 list items
    const templateItem = this.page.getByRoleUI5('Item', { text: templateName });
    await expect(templateItem).toBeVisible({ timeout: 15000 });
    await templateItem.click();
    console.log(`[CopyRequestForm]  Template selected: ${templateName}`);
  }

  async fillNotes(value: string): Promise<void> {
    console.log(`[CopyRequestForm] Filling Notes: "${value}"`);
    const notesField = getFieldByLabelText(this.page, 'Other reason', 'textarea');
    await expect(notesField).toBeVisible({ timeout: 10000 });
    await fillUI5Field(notesField, value);
  }

  async switchTemplate(templateName: string, confirmLabel = 'Material Number'): Promise<void> {
    console.log(`[CopyRequestForm] Switching to template: ${templateName}`);

    // Debug: log all buttons on the page to find Switch templates
    const allBtns = this.page.getByRoleUI5('Button');
    const btnCount = await allBtns.count();
    console.log(`[CopyRequestForm] Found ${btnCount} Button elements`);
    for (let b = 0; b < Math.min(btnCount, 30); b++) {
      const bText = await allBtns
        .nth(b)
        .textContent()
        .catch(() => '');
      console.log(`[CopyRequestForm]   Button #${b}: "${bText?.trim()}"`);
    }

    // Debug: log all Links
    const allLinks = this.page.getByRoleUI5('Link');
    const linkCount = await allLinks.count();
    console.log(`[CopyRequestForm] Found ${linkCount} Link elements`);
    for (let l = 0; l < Math.min(linkCount, 20); l++) {
      const lText = await allLinks
        .nth(l)
        .textContent()
        .catch(() => '');
      console.log(`[CopyRequestForm]   Link #${l}: "${lText?.trim()}"`);
    }

    // Try various locators for the Switch templates button
    const locators = [
      this.page.getByRoleUI5('Button', { text: 'Switch templates' }),
      this.page.getByRole('button', { name: /switch/i }),
      this.page.getByText('Switch templates'),
      this.page.locator('button:has-text("Switch templates")'),
    ];
    for (const loc of locators) {
      if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[CopyRequestForm]  Found Switch templates button');
        await loc.click();
        await this.page.waitForTimeout(2000);
        const templateSearch = this.page.getByRole('searchbox', { name: 'Search' });
        await expect(templateSearch).toBeVisible({ timeout: 10000 });
        await templateSearch.fill(templateName);
        await this.page.locator('[id$="templateChangeListTab-searchField-search"]').click();
        await this.waitForBusy(5000);
        await this.page.getByText(templateName, { exact: true }).click();
        await expect(
          this.page.locator('label').filter({ hasText: confirmLabel }).first()
        ).toBeVisible({ timeout: 60000 });
        await this.waitForBusy(5000);
        console.log(`[CopyRequestForm]  Template switched to: ${templateName}`);
        return;
      }
    }

    // Inspect the Template Select opened popup via DOM
    const templateSelect = this.page
      .getByRoleUI5('Select')
      .filter({ hasText: 'New Product' })
      .first();
    if (await templateSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[CopyRequestForm] Found Template Select, inspecting dropdown DOM...');
      await templateSelect.click();
      await this.page.waitForTimeout(2000);

      // Use JS to inspect all text in the open popup/dropdown
      const domInfo = await this.page.evaluate(() => {
        const popups = document.querySelectorAll(
          '.sapMPopup, .sapMSelectList, [role="listbox"], .sapUiSelectPopup'
        );
        const results: string[] = [];
        popups.forEach((popup, idx) => {
          if (popup.checkVisibility()) {
            results.push(
              `Popup #${idx}: visible, text="${popup.textContent?.trim().substring(0, 200)}"`
            );
            // Find all list items or options
            const items = popup.querySelectorAll(
              '[role="option"], [role="listitem"], li, .sapMSelectListItem'
            );
            items.forEach((item, itemIdx) => {
              results.push(`  Item #${itemIdx}: text="${item.textContent?.trim()}"`);
            });
            // Find any input fields in popup
            const inputs = popup.querySelectorAll('input, textarea, [contenteditable]');
            inputs.forEach((inp, inpIdx) => {
              results.push(
                `  Input #${inpIdx}: placeholder="${(inp as HTMLInputElement).placeholder || ''}"`
              );
            });
          }
        });
        if (popups.length === 0) {
          // Check for aria-live or dropdown regions
          const allVisible = document.querySelectorAll('*');
          const dropdownElements: string[] = [];
          allVisible.forEach(el => {
            const role = el.getAttribute('role');
            if (
              role === 'listbox' ||
              role === 'option' ||
              el.classList.contains('sapMSelectListItem')
            ) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                dropdownElements.push(
                  `  ${role || el.className}: text="${el.textContent?.trim()}"`
                );
              }
            }
          });
          if (dropdownElements.length > 0) {
            results.push('Found actual visible list/option elements:');
            dropdownElements.forEach(d => results.push(d));
          } else {
            results.push('No visible dropdown elements found via standard selectors');
          }
        }
        return results;
      });
      domInfo.forEach(line => console.log(`[CopyRequestForm] ${line}`));

      // Try to type into the Select (if it has an inner input)
      const innerInput = await this.page.evaluate(() => {
        const select = document.querySelector('[role="combobox"], .sapMSlt');
        if (!select) return null;
        const input = select.querySelector('input');
        return input ? 'found' : 'not-found';
      });
      console.log(`[CopyRequestForm] Inner input in Select: ${innerInput}`);

      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(1000);
    }

    // The Template Select has an inner input — try typing to trigger async search
    console.log('[CopyRequestForm] Template Select has inner input, trying typeahead search...');
    await templateSelect.click();
    await this.page.waitForTimeout(1000);

    // Find and focus the inner input
    const innerInput = templateSelect.locator('input').first();
    if (await innerInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[CopyRequestForm] Focusing inner input...');
      await innerInput.click();
      await this.page.waitForTimeout(500);
      // Clear and type
      await innerInput.fill('');
      await this.page.waitForTimeout(300);
      await innerInput.fill(templateName);
      await this.page.waitForTimeout(3000);

      // Check if suggestion popup appeared
      const suggestionItem = this.page.getByRoleUI5('Item', { text: templateName });
      if (await suggestionItem.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log(`[CopyRequestForm]  Found "${templateName}" in suggestions after typeahead`);
        await suggestionItem.click();
        console.log(`[CopyRequestForm]  Template selected: ${templateName}`);
        return;
      }

      // Also check for list items in popups
      const foundViaJS = await this.page.evaluate((name) => {
        const items = document.querySelectorAll(
          '.sapMSelectListItem, [role="option"], [role="listitem"]'
        );
        for (const item of items) {
          if (item.textContent?.trim() === name) {
            (item as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, templateName);
      if (foundViaJS) {
        console.log(`[CopyRequestForm]  "${templateName}" selected via JS click`);
        await this.page.waitForTimeout(2000);
        return;
      }

      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(1000);
    }

    throw new Error(
      `[CopyRequestForm] Cannot switch template in Copy Request form. ` +
        `The Template Select dropdown does not contain "${templateName}". ` +
        `Typeahead search also did not find it. ` +
        `The My Request copy form only shows recently used templates. ` +
        `Consider using Master Data copy flow instead.`
    );
  }

  async copy(params: {
    sourceCR: string;
    templateName: string;
    templateKey?: string;
    description?: string;
    priority?: string;
    notes?: string;
  }): Promise<string> {
    const description =
      params.description || `[AUTO] FR-E2E-MM-03 ${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const priority = params.priority || 'Medium';
    const notes = params.notes || `Automated test: ${description}`;

    // Open copy request
    console.log(`[CopyRequestForm] Copying from CR: ${params.sourceCR}`);
    const searchField = this.page.getByRoleUI5('SearchField').first();
    await searchAndClick(this.page, searchField, params.sourceCR);

    const menuButton = this.page.getByRoleUI5('Button', { text: '...' }).first();
    await expect(menuButton).toBeVisible({ timeout: 15000 });
    await menuButton.click();

    await this.page.getByRoleUI5('MenuItem', { text: 'Copy request' }).click();

    // Wait for CR detail to load — Material Number label signals form ready
    console.log('[CopyRequestForm] Waiting for CR detail to load...');
    await expect(this.page.getByRoleUI5('Label', { text: 'Material Number' }).first()).toBeVisible({
      timeout: 60000,
    });
    console.log('[CopyRequestForm]  CR detail loaded');

    // Fill header
    await this.fillDescription(description);
    await this.selectPriority(priority);

    // Select template — use Switch templates dialog for cross-object-type changes
    if (params.templateKey) {
      await this.selectTemplate(params.templateKey, params.templateName);
    } else {
      await this.switchTemplate(params.templateName);
    }

    // Fill notes
    await this.fillNotes(notes);

    // Submit
    return await this.submit();
  }

  async submit(comment = 'Requestor has submitted this request !'): Promise<string> {
    console.log('[CopyRequestForm] Submitting CR...');
    const newCR = await submitCRWithConfirm(this.page, comment);
    console.log(`[CopyRequestForm]  CR submitted successfully: ${newCR}`);
    return newCR;
  }
}
