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
    id: 'R1',
    desc: 'F4 source productType -> baseUnit acceptedAnyValue',
    rule: {
      sourceSection: 'GLOBALDATA',
      sourceField: 'productType',
      targetSection: 'BASICGENERAL',
      targetField: 'baseUnit',
      sourceValue: 'FERT',
      acceptedAnyValue: true,
    },
    verify: async (ctx: any) => {
      const { mainMR } = ctx;
      await mainMR.navigateToTargetArea('Global Data');
      await mainMR.fillF4Source(1, 'FERT', 'FERT');
      await mainMR.navigateToTargetArea('Basic Data');
      await mainMR.verifyMandatoryAsterisk('Base Unit of Measure');
      await mainMR.clearFieldByLabel('Base Unit of Measure');
      await mainMR.submitAndExpectFieldError(
        'The field <Base Unit of Measure> in Section <BASICGENERAL> is required.'
      );
    },
    targetField: 'baseUnit',
  },
  {
    id: 'R6',
    desc: 'INPUT source productOldID -> weightUnit with string value',
    rule: {
      sourceSection: 'BASICGENERAL',
      sourceField: 'productOldID',
      targetSection: 'BASICDIMENSION',
      targetField: 'weightUnit',
      sourceValue: '99999',
    },
    verify: async (ctx: any) => {
      const { mainMR } = ctx;
      await mainMR.navigateToTargetArea('Basic Data');
      await mainMR.fillInputByLabel('Old Material Number', '99999', { pressEnter: true });
      await mainMR.verifyMandatoryAsterisk('Weight Unit');
      await mainMR.clearFieldByLabel('Weight Unit');
      await mainMR.submitAndExpectFieldError(
        'The field <Weight Unit> in Section <BASICDIMENSION> is required.'
      );
    },
    targetField: 'weightUnit',
  },
  {
    id: 'R7',
    desc: 'INPUT source stackabilityFactor -> grossWeight with numeric default',
    rule: {
      sourceSection: 'BASICGENERAL',
      sourceField: 'stackabilityFactor',
      targetSection: 'BASICDIMENSION',
      targetField: 'grossWeight',
      sourceValue: '10',
    },
    verify: async (ctx: any) => {
      const { mainMR } = ctx;
      await mainMR.navigateToTargetArea('Basic Data');
      await mainMR.fillInputByLabel('Stackability Factor', '10', { pressEnter: true });
      await mainMR.verifyMandatoryAsterisk('Gross Weight');
      await mainMR.clearFieldByLabel('Gross Weight');
      await mainMR.submitAndExpectFieldError(
        'The field <Gross Weight> in Section <BASICDIMENSION> is required.'
      );
    },
    targetField: 'grossWeight',
  },
  {
    id: 'R8',
    desc: 'CHECKBOX source isBatchManagementRequired -> netWeight',
    rule: {
      sourceSection: 'GENERALPLANTDATA1',
      sourceField: 'isBatchManagementRequired',
      targetSection: 'BASICDIMENSION',
      targetField: 'netWeight',
      sourceValue: 'true',
    },
    verify: async (ctx: any) => {
      const { mainMR } = ctx;
      await mainMR.navigateToTargetArea('Plant General Data');
      await mainMR.clickCheckboxByLabel('Batch Management Req. Indicator');
      await mainMR.navigateToTargetArea('Dimensions/EANs');
      await mainMR.verifyMandatoryAsterisk('Net Weight');
      await mainMR.clearFieldByLabel('Net Weight');
      await mainMR.submitAndExpectFieldError(
        'The field <Net Weight> in Section <BASICDIMENSION> is required.'
      );
    },
    targetField: 'netWeight',
  },
];

let ctx: TestContext;

test.describe.serial(
  'MR-E2E-MM-05: Admin Create Rule - Source Field Types',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    test.beforeAll(async ({ browser }) => {
      ctx = await setupTestContext(browser);
      await loginBoth(ctx);
      await ctx.adminMR.navigateToMandatoryRule(TEMPLATE_NAME);
    });

    for (const p of PARAMS) {
      test(`${p.id}: ${p.desc}`, { tag: ['@data-driven', '@happy-path', '@TC-05'] }, async () => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        const description = `MR-05 ${p.id}: ${p.desc} [AUTO] ${generateTimestamp()}`;
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
