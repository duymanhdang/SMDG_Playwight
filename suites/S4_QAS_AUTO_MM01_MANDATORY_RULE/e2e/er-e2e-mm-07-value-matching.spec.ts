import { test, expect } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupMr';
import { createMandatoryRuleBySourceField, safeDeleteMandatoryRule } from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, generateTimestamp } from '../suite.config';

const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_MANDATORY_RULE.name;

test.describe.serial(
  'MR-E2E-MM-07: Value-Matching & Dynamic Re-evaluation',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    let ctx: ReturnType<typeof Object>;

    test.beforeAll(async ({ browser }) => {
      ctx = await setupTestContext(browser);
      await loginBoth(ctx);
    });

    test(
      'T1: acceptedAnyValue triggers mandatory for any value',
      { tag: ['@happy-path', '@TC-07'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        const { adminMR, mainMR, myRequest } = ctx;
        const desc = `MR-07 T1: acceptedAnyValue [AUTO] ${generateTimestamp()}`;

        try {
          await createMandatoryRuleBySourceField(adminMR, TEMPLATE_NAME, {
            sourceSection: 'BASICGENERAL',
            sourceField: 'productOldID',
            targetSection: 'BASICDIMENSION',
            targetField: 'weightUnit',
            sourceValue: '12345',
            acceptedAnyValue: true,
          });

          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, desc);
          await mainMR.navigateToTargetArea('Basic Data');
          await mainMR.fillInputByLabel('Old Material Number', 'ANY_VALUE', { pressEnter: true });
          await mainMR.navigateToTargetArea('Dimensions/EANs');
          await mainMR.verifyMandatoryAsterisk('Weight Unit');
          await mainMR.clearFieldByLabel('Weight Unit');
          await mainMR.submitAndExpectFieldError(
            'The field <Weight Unit> in Section <BASICDIMENSION> is required.'
          );
        } finally {
          await safeDeleteMandatoryRule(adminMR, 'weightUnit');
        }
      }
    );

    test(
      'T2: Non-matching source value does NOT trigger mandatory',
      { tag: ['@negative', '@TC-08'] },
      async () => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        const { adminMR, mainMR, myRequest } = ctx;
        const desc = `MR-07 T2: Non-matching value [AUTO] ${generateTimestamp()}`;

        try {
          await createMandatoryRuleBySourceField(adminMR, TEMPLATE_NAME, {
            sourceSection: 'BASICGENERAL',
            sourceField: 'productOldID',
            targetSection: 'BASICDIMENSION',
            targetField: 'weightUnit',
            sourceValue: 'SPECIFIC_VAL',
          });

          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, desc);
          await mainMR.navigateToTargetArea('Basic Data');
          await mainMR.fillInputByLabel('Old Material Number', 'NON_MATCHING', {
            pressEnter: true,
          });
          await mainMR.navigateToTargetArea('Dimensions/EANs');
          await mainMR.verifyNotMandatory('Weight Unit');
        } finally {
          await safeDeleteMandatoryRule(adminMR, 'weightUnit');
        }
      }
    );
  }
);
