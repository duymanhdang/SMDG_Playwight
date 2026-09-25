import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupEr';
import {
  createEditableRuleBySourceField,
  addAnotherEditableRuleBySourceField,
  safeDeleteEditableRule,
} from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('er-e2e-mm-10');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-10: Main Multiple Rules on Same Target Field',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'R2 (division→productOldID) + R7 (materialVolume→productStandardID) — different sources, different targets',
      { tag: ['@happy-path', '@TC-09'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await setupTestContext(browser);
        const { adminER, mainER, myRequest, form } = ctx;

        const description = `${TD.description} [AUTO] ${generateTimestamp()}`;
        const fieldsToClean = ['productOldID', 'productStandardID'];
        let newCR = '';

        try {
          logPhase('PHASE 1', 'ADMIN — Create R2 + R7');
          await loginBoth(ctx);

          await createEditableRuleBySourceField(adminER, TEMPLATE_NAME, {
            sourceSection: 'BASICGENERAL',
            sourceField: 'division',
            targetSection: 'BASICGENERAL',
            targetField: 'productOldID',
            sourceValue: '*',
            acceptedAnyValue: true,
          });

          await addAnotherEditableRuleBySourceField(adminER, {
            sourceSection: 'BASICDIMENSION',
            sourceField: 'materialVolume',
            targetSection: 'BASICDIMENSION',
            targetField: 'productStandardID',
            sourceValue: '1',
          });

          logPhase('PHASE 2', 'REQUESTOR — Verify both rules active independently');
          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);

          await mainER.navigateToTargetArea('Basic Data');
          await mainER.clickF4Icon(5);
          await mainER.searchF4('0001');
          await mainER.selectF4FirstRowColumn(1, '0001');
          await mainER.verifyNotEditableByIndex(1);

          await mainER.navigateToTargetArea('Dimensions/EANs');
          await mainER.fillInputByLabel('Volume', '1');
          await mainER.verifyNotEditableByIndex(7);

          await mainER.fillInputByLabel('Volume', '2');
          await mainER.verifyEditableByIndex(7);

          logPhase('PHASE 3', 'Submit CR');
          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');
          await myRequest.cancelCR(newCR);

          logPhase('PHASE 4', 'CLEANUP');
          for (const f of fieldsToClean) {
            await adminER.deleteRule(f).catch(() => {});
          }
        } finally {
          for (const f of fieldsToClean) {
            await safeDeleteEditableRule(adminER, f);
          }
        }
      }
    );
  }
);
