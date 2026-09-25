import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupMr';
import {
  createMandatoryRuleByUserAttribute,
  safeDeleteMandatoryRule,
} from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, generateTimestamp } from '../suite.config';

const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_MANDATORY_RULE.name;

test.describe(
  'MR-E2E-MM-09: Admin Create Rule - User Attribute Mode',
  { tag: ['@rules', '@mandatory-rule', '@mm', '@bp:mandatory-rule'] },
  () => {
    test(
      'User Attribute mode: User ID -> volumeUnit mandatory',
      { tag: ['@happy-path', '@TC-10'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);
        const ctx = await setupTestContext(browser);
        const { adminMR, mainMR, myRequest } = ctx;
        const description = `MR-09: User Attribute mode [AUTO] ${generateTimestamp()}`;

        try {
          logPhase('PHASE 1', 'ADMIN — Create rule with User ID attribute');
          await loginBoth(ctx);
          await adminMR.navigateToMandatoryRule(TEMPLATE_NAME);
          await adminMR.clickAddNew();
          await adminMR.verifyAddNewDialogVisible();

          await adminMR.selectUserAttribute('User ID');
          await adminMR.selectTargetSection('BASICDIMENSION');
          await adminMR.selectTargetField('volumeUnit');
          await adminMR.fillSourceValue('smdg.prestage@proton.me');
          await adminMR.clickAddRule();
          await adminMR.verifyToast('Business Rule Created');

          logPhase('PHASE 2', 'REQUESTOR — Verify auto-triggered mandatory');
          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);
          await mainMR.navigateToTargetArea('Dimensions/EANs');
          await mainMR.verifyMandatoryAsterisk('Volume Unit');
          await mainMR.clearFieldByLabel('Volume Unit');
          await mainMR.submitAndExpectFieldError(
            'The field <Volume Unit> in Section <BASICDIMENSION> is required.'
          );

          logPhase('CLEANUP', 'Delete created rules');
          await adminMR.safeDeleteRule('volumeUnit');
        } finally {
          await safeDeleteMandatoryRule(adminMR, 'volumeUnit');
        }
      }
    );
  }
);
