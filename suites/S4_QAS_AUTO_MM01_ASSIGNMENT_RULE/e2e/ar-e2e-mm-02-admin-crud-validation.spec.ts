import { test, expect } from '@playwright/test';
import { AdminAssignmentRulePage } from '../../../pages/admin/AdminAssignmentRulePage';
import { suiteConfig, getTestData } from '../suite.config';
import { loginAs } from '../../../helpers/auth';

const TD = getTestData('ar-e2e-mm-02');

test.describe(
  'AR-E2E-MM-02: Admin - CRUD Operations & Validations (Data-Driven)',
  { tag: ['@rules', '@assignment-rule', '@mm', '@bp:assignment-rule'] },
  () => {
    let adminPage: import('@playwright/test').Page;
    let adminAR: AdminAssignmentRulePage;

    test.beforeAll(async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      adminPage = await ctx.newPage();
      adminAR = new AdminAssignmentRulePage(adminPage);
      await adminPage.evaluate(() => {
        document.title = '[ADMIN] SimpleMDG';
      });
      await loginAs(adminPage, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
      await adminAR.navigateToAssignmentRule(suiteConfig.templates.AUTO_MM01_ASSIGNMENT_RULE.name);
    });

    // ── SCENARIO: CREATE_VALID ─────────────────────────────────────
    test(
      'CRUD: CREATE_VALID - Successfully create a valid rule',
      { tag: ['@happy-path', '@admin', '@TC-01'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.phaseTimeout);
        const s = TD.scenarios.find((sc: any) => sc.id === 'CREATE_VALID');

        await adminAR.clickAddNew();
        await adminAR.verifyAddNewDialogVisible();
        await adminAR.selectSourceSection(s.sourceSection);
        await adminAR.selectSourceField(s.sourceField);
        await adminAR.selectTargetSection(s.targetSection);
        await adminAR.selectTargetField(s.targetField);
        await adminAR.selectSourceProperty(s.sourceProperty);
        await adminAR.clickAddRule();

        await adminAR.searchRuleBySourceSection(s.sourceSection);
        await adminAR.verifyRuleRowVisible();

        // Cleanup: delete the created rule
        await adminAR.clickDeleteRule();
        await adminAR.verifyConfirmationDialog();
        await adminAR.confirmDelete();

        console.log(`[OK] SCENARIO: ${s.id} completed`);
      }
    );

    // ── SCENARIO: CREATE_MISSING_SOURCE_SECTION ────────────────────
    test(
      'CRUD: CREATE_MISSING_SOURCE_SECTION - Error when source section empty',
      { tag: ['@negative', '@admin', '@TC-02'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.phaseTimeout);
        const s = TD.scenarios.find((sc: any) => sc.id === 'CREATE_MISSING_SOURCE_SECTION');

        await adminAR.clickAddNew();
        await adminAR.verifyAddNewDialogVisible();
        // Only fill target fields (source section/field empty)
        await adminAR.selectTargetSection(s.targetSection);
        await adminAR.selectTargetField(s.targetField);
        await adminAR.clickAddRuleAndExpectDialog();

        await adminAR.verifyErrorMessage(s.expectedMessage);
        await adminAR.closeErrorDialog();
        await adminAR.cancelAddNewDialog();

        console.log(`[OK] SCENARIO: ${s.id} completed`);
      }
    );

    // ── SCENARIO: CREATE_MISSING_TARGET_SECTION ────────────────────
    test(
      'CRUD: CREATE_MISSING_TARGET_SECTION - Error when target section empty',
      { tag: ['@negative', '@admin', '@TC-03'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.phaseTimeout);
        const s = TD.scenarios.find((sc: any) => sc.id === 'CREATE_MISSING_TARGET_SECTION');

        await adminAR.clickAddNew();
        await adminAR.verifyAddNewDialogVisible();
        // Only fill source fields (target section/field empty)
        await adminAR.selectSourceSection(s.sourceSection);
        await adminAR.selectSourceField(s.sourceField);
        await adminAR.clickAddRuleAndExpectDialog();

        await adminAR.verifyErrorMessage(s.expectedMessage);
        await adminAR.closeErrorDialog();
        await adminAR.cancelAddNewDialog();

        console.log(`[OK] SCENARIO: ${s.id} completed`);
      }
    );

    // ── SCENARIO: CREATE_DUPLICATE ─────────────────────────────────
    test(
      'CRUD: CREATE_DUPLICATE - Error when duplicate rule exists',
      { tag: ['@negative', '@admin', '@TC-04'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.phaseTimeout);
        const s = TD.scenarios.find((sc: any) => sc.id === 'CREATE_DUPLICATE');

        // Step 1: Create the rule first
        await adminAR.clickAddNew();
        await adminAR.verifyAddNewDialogVisible();
        await adminAR.selectSourceSection(s.sourceSection);
        await adminAR.selectSourceField(s.sourceField);
        await adminAR.selectTargetSection(s.targetSection);
        await adminAR.selectTargetField(s.targetField);
        await adminAR.selectSourceProperty(s.sourceProperty);
        await adminAR.clickAddRule();

        // Step 2: Try to create the same rule again
        await adminAR.clickAddNew();
        await adminAR.verifyAddNewDialogVisible();
        await adminAR.selectSourceSection(s.sourceSection);
        await adminAR.selectSourceField(s.sourceField);
        await adminAR.selectTargetSection(s.targetSection);
        await adminAR.selectTargetField(s.targetField);
        await adminAR.selectSourceProperty(s.sourceProperty);
        await adminAR.clickAddRuleAndExpectDialog();

        await adminAR.verifyErrorMessage(s.expectedMessage);
        await adminAR.closeErrorDialog();
        await adminAR.cancelAddNewDialog();

        // Cleanup: delete the original rule
        await adminAR.searchRuleBySourceSection(s.sourceSection);
        await adminAR.verifyRuleRowVisible();
        await adminAR.clickDeleteRule();
        await adminAR.verifyConfirmationDialog();
        await adminAR.confirmDelete();

        console.log(`[OK] SCENARIO: ${s.id} completed`);
      }
    );

    // ── SCENARIO: CREATE_NO_FIELDS ─────────────────────────────────
    test(
      'CRUD: CREATE_NO_FIELDS - Error when section has no available fields',
      { tag: ['@negative', '@admin', '@TC-05'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.phaseTimeout);
        const s = TD.scenarios.find((sc: any) => sc.id === 'CREATE_NO_FIELDS');

        await adminAR.clickAddNew();
        await adminAR.verifyAddNewDialogVisible();
        // Select source section that has no available fields
        await adminAR.selectSourceSection(s.sourceSection);
        await adminAR.clickAddRuleAndExpectDialog();

        await adminAR.verifyErrorMessage(s.expectedMessage);
        await adminAR.closeErrorDialog();
        await adminAR.cancelAddNewDialog();

        console.log(`[OK] SCENARIO: ${s.id} completed`);
      }
    );

    // ── SCENARIO: DELETE_WITH_CONFIRM ──────────────────────────────
    test(
      'CRUD: DELETE_WITH_CONFIRM - Delete rule with confirmation',
      { tag: ['@admin', '@TC-06'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.phaseTimeout);
        const s = TD.scenarios.find((sc: any) => sc.id === 'DELETE_WITH_CONFIRM');

        // Step 1: Create a rule to delete (handle if already exists)
        await adminAR.clickAddNew();
        await adminAR.verifyAddNewDialogVisible();
        await adminAR.selectSourceSection(s.sourceSection);
        await adminAR.selectSourceField(s.sourceField);
        await adminAR.selectTargetSection(s.targetSection);
        await adminAR.selectTargetField(s.targetField);
        await adminAR.selectSourceProperty(s.sourceProperty);
        await adminAR.clickAddRule();
        await adminAR.dismissErrorDialogIfPresent();

        // Step 2: Delete it with confirmation
        await adminAR.searchRuleBySourceSection(s.sourceSection);
        await adminAR.verifyRuleRowVisible();
        await adminAR.clickDeleteRule();
        await adminAR.verifyConfirmationDialog();
        await adminAR.confirmDelete();

        console.log(`[OK] SCENARIO: ${s.id} completed`);
      }
    );

    test.afterAll(async () => {
      console.log('[Cleanup] AUTO-02 CRUD spec completed');
    });
  }
);
