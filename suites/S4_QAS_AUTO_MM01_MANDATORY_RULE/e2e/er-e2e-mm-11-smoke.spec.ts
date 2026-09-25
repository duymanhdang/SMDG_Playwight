import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupMr';
import {
  createMandatoryRuleBySourceField,
  addAnotherMandatoryRuleBySourceField,
  safeDeleteMandatoryRule,
} from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, suiteData, generateTimestamp } from '../suite.config';

const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_MANDATORY_RULE.name;

test.describe(
  'MR-E2E-MM-11: Smoke - Mandatory Rule Happy Path',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    test(
      'Admin create rule -> Main verify mandatory -> Cleanup',
      { tag: ['@smoke', '@happy-path', '@TC-12'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        const ctx = await setupTestContext(browser);
        const { adminMR, mainMR, myRequest, form } = ctx;
        const description = `MR Smoke: Admin->Main->Cleanup [AUTO] ${generateTimestamp()}`;
        const fieldsToClean: string[] = [];

        try {
          logPhase(
            'PHASE 1',
            'ADMIN — Create Mandatory Rule (Source Field)',
            'BASICGENERAL.productOldID -> BASICDIMENSION.weightUnit'
          );
          await loginBoth(ctx);
          await createMandatoryRuleBySourceField(adminMR, TEMPLATE_NAME, {
            sourceSection: 'BASICGENERAL',
            sourceField: 'productOldID',
            targetSection: 'BASICDIMENSION',
            targetField: 'weightUnit',
            sourceValue: '12345',
          });
          fieldsToClean.push('weightUnit');

          logPhase('PHASE 2', 'REQUESTOR — Verify mandatory rule on Main form');
          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);

          await mainMR.navigateToTargetArea('Basic Data');
          await mainMR.verifyLabelVisible('Old Material Number');
          await mainMR.fillInputByLabel('Old Material Number', '12345', { pressEnter: true });
          await mainMR.verifyMandatoryAsterisk('Weight Unit');
          await mainMR.clearFieldByLabel('Weight Unit');
          await mainMR.submitAndExpectFieldError(
            'The field <Weight Unit> in Section <BASICDIMENSION> is required.'
          );

          logPhase('PHASE 3', 'CLEANUP');
          for (const f of fieldsToClean) {
            await adminMR.safeDeleteRule(f);
          }
        } finally {
          for (const f of fieldsToClean) {
            await safeDeleteMandatoryRule(adminMR, f);
          }
        }
      }
    );
  }
);
