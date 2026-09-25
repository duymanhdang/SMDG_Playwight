import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth, type TestContext } from '../../../helpers/setup/testSetupMr';
import {
  addAnotherMandatoryRuleBySourceField,
  safeDeleteMandatoryRule,
  type SourceFieldRuleParams,
} from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, generateTimestamp } from '../suite.config';

const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_MANDATORY_RULE.name;

interface RuleParam {
  id: string;
  desc: string;
  rule: SourceFieldRuleParams;
  verify: (ctx: any) => Promise<void>;
  targetField: string;
}

const PARAMS: RuleParam[] = [
  {
    id: 'R2',
    desc: 'Single source -> Repeatable child target (F4 source)',
    rule: {
      sourceSection: 'GLOBALDATA',
      sourceField: 'productType',
      targetSection: 'GENERALPLANTDATASTORAGE',
      targetField: 'warehouseStorageBin',
      sourceValue: 'FERT',
    },
    verify: async (ctx: any) => {
      const { mainMR } = ctx;
      await mainMR.navigateToTargetArea('Plant Data');
      await mainMR.verifyTextVisible('Global Data');
      await mainMR.verifyLabelVisible('Material Type');
      await mainMR.fillF4Source(1, 'FERT', 'FERT');
      await mainMR.clickOpenSectionButton(22);
      await mainMR.verifySectionTitleVisible('Plant Data');
      await mainMR.switchDialogTab('Plant Data/Storage Location');
      await mainMR.clickAddButton();
      await mainMR.verifySectionTitleVisible('Plant Data/Storage Location');
      await mainMR.verifyLabelVisible('Storage Location', 1);
      await mainMR.clickF4Icon(6);
      await mainMR.searchAndSelectF4('0001');
      await mainMR.page.locateUI5('//Dialog[3]/Table[1]/ColumnListItem[1]/Text[1]').click();
      await mainMR.page.waitForTimeout(500);
      await mainMR.verifyLabelVisible('Storage Bin', 1);
      await mainMR.verifyMandatoryAsterisk('Storage Bin', 1);
      await mainMR.clickAddNewLineButton();
      await mainMR.verifyRequireErrorThenClose(
        'The field <Storage Bin> in Section <GENERALPLANTDATASTORAGE> is required.'
      );
      await mainMR.closeDialog(1);
      await mainMR.closeDialog();
    },
    targetField: 'warehouseStorageBin',
  },
  {
    id: 'R3',
    desc: 'Repeatable source+target in same section',
    rule: {
      sourceSection: 'UNITSOFMEASURE',
      sourceField: 'quantityDenominator',
      targetSection: 'UNITSOFMEASURE',
      targetField: 'quantityNumerator',
      sourceValue: '10',
    },
    verify: async (ctx: any) => {
      const { mainMR } = ctx;
      await mainMR.navigateToTargetArea('Units of Measure');
      await mainMR.verifyTextVisible('Units of Measure');
      await mainMR.clickOpenSectionButton(1);
      await mainMR.verifySectionTitleVisible('Units of Measure');
      await mainMR.verifyLabelVisible('Denominator');
      await mainMR.fillInputByValue('1', '10');
      await mainMR.verifyLabelVisible('Numerator');
      await mainMR.verifyMandatoryAsterisk('Numerator');
      await mainMR.clearInputByValue('1');
      await mainMR.clickUpdateButton();
      await mainMR.verifyRequireErrorThenClose(
        'The field <Numerator> in Section <UNITSOFMEASURE> is required.'
      );
      await mainMR.closeDialog();
    },
    targetField: 'quantityNumerator',
  },
  {
    id: 'R4',
    desc: 'Single source (Basic Data) -> Repeatable target (Units of Measure)',
    rule: {
      sourceSection: 'BASICGENERAL',
      sourceField: 'baseUnit',
      targetSection: 'UNITSOFMEASURE',
      targetField: 'alternativeUnit',
      sourceValue: 'BAG',
    },
    verify: async (ctx: any) => {
      const { mainMR } = ctx;
      await mainMR.navigateToTargetArea('Basic Data');
      await mainMR.verifyTextVisible('Basic Data');
      await mainMR.verifyLabelVisible('Base Unit of Measure');
      await mainMR.fillF4Source(2, 'BAG', 'BAG');
      await mainMR.verifyTextVisible('Units of Measure');
      await mainMR.clickOpenSectionButton(1);
      await mainMR.verifySectionTitleVisible('Units of Measure');
      await mainMR.verifyLabelVisible('Alternative Unit');
      await mainMR.verifyMandatoryAsterisk('Alternative Unit');
      const dialog = mainMR.page.locator('.sapMDialog').last();
      await dialog.getByRoleUI5('Token', { text: 'EA' }).first().click();
      await mainMR.page.waitForTimeout(200);
      await mainMR.page.keyboard.press('Delete');
      await mainMR.page.waitForTimeout(300);
      await mainMR.clickUpdateButton();
      await mainMR.verifyRequireErrorThenClose(
        'The field <Alternative Unit> in Section <UNITSOFMEASURE> is required.'
      );
      await mainMR.closeDialog();
    },
    targetField: 'alternativeUnit',
  },
  {
    id: 'R5',
    desc: 'Repeatable source -> Repeatable child target',
    rule: {
      sourceSection: 'PLANTDATA',
      sourceField: 'plant',
      targetSection: 'GENERALPLANTDATASTORAGE',
      targetField: 'plant',
      sourceValue: '0001',
    },
    verify: async (ctx: any) => {
      const { mainMR } = ctx;
      await mainMR.navigateToTargetArea('Plant Data');
      await mainMR.verifyTextVisible('Plant Data');
      await mainMR.clickOpenSectionButton(22);
      await mainMR.verifySectionTitleVisible('Plant Data');
      await mainMR.verifyLabelVisible('Plant');
      await mainMR.clickF4Icon(0);
      await mainMR.searchAndSelectF4('0001');
      await mainMR.page.locateUI5('//Dialog[2]/Table[1]/ColumnListItem[1]/Text[1]').click();
      await mainMR.page.waitForTimeout(500);
      await mainMR.switchDialogTab('Plant Data/Storage Location');
      await mainMR.clickAddButton();
      await mainMR.verifySectionTitleVisible('Plant Data/Storage Location');
      await mainMR.verifyLabelVisible('Storage Location', 1);
      await mainMR.clickF4Icon(6);
      await mainMR.searchAndSelectF4('0001');
      await mainMR.page.locateUI5('//Dialog[3]/Table[1]/ColumnListItem[1]/Text[1]').click();
      await mainMR.page.waitForTimeout(500);
      await mainMR.verifyLabelVisible('Plant', 2);
      await mainMR.verifyMandatoryAsterisk('Plant', 2);
      await mainMR.clickAddNewLineButton();
      await mainMR.verifyRequireErrorThenClose(
        'The field <Plant> in Section <GENERALPLANTDATASTORAGE> is required.'
      );
      await mainMR.closeDialog(1);
      await mainMR.closeDialog();
    },
    targetField: 'plant',
  },
];

let ctx: TestContext;

test.describe.serial(
  'MR-E2E-MM-03: Core Mandatory Trigger - Structural Coverage',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    test.beforeAll(async ({ browser }) => {
      ctx = await setupTestContext(browser);
      await loginBoth(ctx);
      await ctx.adminMR.navigateToMandatoryRule(TEMPLATE_NAME);
    });

    for (const p of PARAMS) {
      test(
        `Pair ${p.id}: ${p.desc}`,
        { tag: ['@data-driven', '@happy-path', '@TC-03'] },
        async () => {
          test.setTimeout(suiteConfig.timeouts.e2eTest);
          const description = `MR-03: ${p.desc} [AUTO] ${generateTimestamp()}`;
          try {
            logPhase('PHASE 1', `ADMIN — Create Mandatory Rule: ${p.id}`);
            await addAnotherMandatoryRuleBySourceField(ctx.adminMR, p.rule);

            logPhase('PHASE 2', `REQUESTOR — Verify: ${p.desc}`);
            await openCopyRequestAndFillHeader(
              ctx.myRequest,
              suiteConfig.sourceCRs.default,
              description
            );
            await p.verify(ctx);
          } finally {
            await safeDeleteMandatoryRule(ctx.adminMR, p.targetField);
          }
        }
      );
    }
  }
);
