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
    id: 'T1',
    desc: 'INPUT target field with mandatory validation',
    rule: {
      sourceSection: 'BASICGENERAL',
      sourceField: 'productOldID',
      targetSection: 'BASICDIMENSION',
      targetField: 'grossWeight',
      sourceValue: '12345',
    },
    verify: async (ctx: any) => {
      const { mainMR } = ctx;
      await mainMR.navigateToTargetArea('Basic Data');
      await mainMR.fillInputByLabel('Old Material Number', '12345', { pressEnter: true });
      await mainMR.navigateToTargetArea('Dimensions/EANs');
      await mainMR.verifyMandatoryAsterisk('Gross Weight');
      await mainMR.clearFieldByLabel('Gross Weight');
      await mainMR.submitAndExpectFieldError(
        'The field <Gross Weight> in Section <BASICDIMENSION> is required.'
      );
    },
    targetField: 'grossWeight',
  },
  {
    id: 'T2',
    desc: 'F4 target field with mandatory validation',
    rule: {
      sourceSection: 'BASICGENERAL',
      sourceField: 'productOldID',
      targetSection: 'BASICDIMENSION',
      targetField: 'weightUnit',
      sourceValue: '12345',
    },
    verify: async (ctx: any) => {
      const { mainMR } = ctx;
      await mainMR.navigateToTargetArea('Basic Data');
      await mainMR.fillInputByLabel('Old Material Number', '12345', { pressEnter: true });
      await mainMR.navigateToTargetArea('Dimensions/EANs');
      await mainMR.verifyMandatoryAsterisk('Weight Unit');
      await mainMR.clearFieldByLabel('Weight Unit');
      await mainMR.submitAndExpectFieldError(
        'The field <Weight Unit> in Section <BASICDIMENSION> is required.'
      );
    },
    targetField: 'weightUnit',
  },
  {
    id: 'T3',
    desc: 'Repeatable section target with mandatory validation',
    rule: {
      sourceSection: 'BASICGENERAL',
      sourceField: 'productOldID',
      targetSection: 'UNITSOFMEASURE',
      targetField: 'alternativeUnit',
      sourceValue: '12345',
    },
    verify: async (ctx: any) => {
      const { mainMR } = ctx;
      await mainMR.navigateToTargetArea('Basic Data');
      await mainMR.fillInputByLabel('Old Material Number', '12345', { pressEnter: true });
      await mainMR.clickOpenSectionButton(1);
      await mainMR.verifySectionTitleVisible('Units of Measure');
      await mainMR.verifyLabelVisible('Alternative Unit');
      await mainMR.verifyMandatoryAsterisk('Alternative Unit');
      await mainMR.closeDialog();
    },
    targetField: 'alternativeUnit',
  },
];

let ctx: TestContext;

test.describe.serial(
  'MR-E2E-MM-06: Target Field Types + Error Display',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    test.beforeAll(async ({ browser }) => {
      ctx = await setupTestContext(browser);
      await loginBoth(ctx);
      await ctx.adminMR.navigateToMandatoryRule(TEMPLATE_NAME);
    });

    for (const p of PARAMS) {
      test(`${p.id}: ${p.desc}`, { tag: ['@data-driven', '@happy-path', '@TC-06'] }, async () => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        const description = `MR-06 ${p.id}: ${p.desc} [AUTO] ${generateTimestamp()}`;
        try {
          logPhase('PHASE 1', `ADMIN — Create rule: ${p.id}`);
          await addAnotherMandatoryRuleBySourceField(ctx.adminMR, p.rule);

          logPhase('PHASE 2', `REQUESTOR — Verify: ${p.id}`);
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
