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
    id: 'R2-ML',
    desc: 'Repeatable child target with multi-line add (R2)',
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

      logPhase('STEP ML-1', 'Add another line — verify mandatory on both');
      await mainMR.clickAddNewLineButton();
      await mainMR.verifyRequireErrorThenClose(
        'The field <Storage Bin> in Section <GENERALPLANTDATASTORAGE> is required.'
      );
      await mainMR.closeDialog(1);
      await mainMR.closeDialog();
    },
    targetField: 'warehouseStorageBin',
  },
];

let ctx: TestContext;

test.describe.serial(
  'MR-E2E-MM-04: Multi-line Repeatable Validation',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    test.beforeAll(async ({ browser }) => {
      ctx = await setupTestContext(browser);
      await loginBoth(ctx);
      await ctx.adminMR.navigateToMandatoryRule(TEMPLATE_NAME);
    });

    for (const p of PARAMS) {
      test(`${p.id}: ${p.desc}`, { tag: ['@data-driven', '@happy-path', '@TC-04'] }, async () => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        const description = `MR-04 ${p.id}: ${p.desc} [AUTO] ${generateTimestamp()}`;
        try {
          logPhase('PHASE 1', `ADMIN — Create rule: ${p.id}`);
          await addAnotherMandatoryRuleBySourceField(ctx.adminMR, p.rule);

          logPhase('PHASE 2', `REQUESTOR — Verify multi-line: ${p.id}`);
          await openCopyRequestAndFillHeader(
            ctx.myRequest,
            suiteConfig.sourceCRs.default,
            description
          );
          await p.verify(ctx);
        } finally {
          await safeDeleteMandatoryRule(ctx.adminMR, p.targetField);
        }
      });
    }
  }
);
