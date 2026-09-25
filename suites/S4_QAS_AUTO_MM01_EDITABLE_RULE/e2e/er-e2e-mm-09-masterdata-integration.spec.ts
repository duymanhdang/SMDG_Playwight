import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupEr';
import { createEditableRuleBySourceField, safeDeleteEditableRule } from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('er-e2e-mm-09');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-09: Main Master Data Integration (History & Update)',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'R2: Division→productOldID — create CR, submit, verify rule persisted in update form',
      { tag: ['@happy-path', '@TC-08'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await setupTestContext(browser);
        const { adminER, mainER, myRequest, form } = ctx;

        const description = `${TD.description} [AUTO] ${generateTimestamp()}`;
        let newCR = '';

        try {
          logPhase('PHASE 1', 'ADMIN — Create Editable Rule R2 (Accepted Any Value)');
          await loginBoth(ctx);
          await createEditableRuleBySourceField(adminER, TEMPLATE_NAME, {
            sourceSection: 'BASICGENERAL',
            sourceField: 'division',
            targetSection: 'BASICGENERAL',
            targetField: 'productOldID',
            sourceValue: '*',
            acceptedAnyValue: true,
          });

          logPhase(
            'PHASE 2',
            'REQUESTOR — Create CR, fill Division, verify target disabled, submit'
          );
          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);

          await mainER.navigateToTargetArea('Basic Data');
          await mainER.verifyTitleVisible('Basic Data');
          await mainER.verifyLabelVisible('Division');

          await mainER.clickF4Icon(5);
          await mainER.searchF4('0001');
          await mainER.selectF4FirstRowColumn(1, '0001');

          await mainER.verifyNotEditableByIndex(1);

          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');

          logPhase(
            'PHASE 3',
            'Update CR — navigate to same field, verify Old Material Number still disabled'
          );
          await myRequest.goto();
          await myRequest.openCopyRequest(newCR, 'Material Number');

          await mainER.navigateToTargetArea('Basic Data');
          await mainER.verifyLabelVisible('Division');
          await mainER.verifyNotEditableByIndex(1);

          await myRequest.cancelCR(newCR);

          logPhase('PHASE 4', 'CLEANUP');
          await adminER.deleteRule('productOldID');
        } finally {
          await safeDeleteEditableRule(adminER, 'productOldID');
        }
      }
    );
  }
);
