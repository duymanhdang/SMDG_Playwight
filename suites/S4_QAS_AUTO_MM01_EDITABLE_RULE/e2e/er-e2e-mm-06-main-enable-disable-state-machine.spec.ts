import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupEr';
import { createEditableRuleBySourceField, safeDeleteEditableRule } from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { verifyDisable } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('er-e2e-mm-06');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-06: Main Core Enable/Disable Logic + Update-State-Machine',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'R2: Division→productOldID (Accepted Any Value) — any Division disables target, submit',
      { tag: ['@happy-path', '@TC-05'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await setupTestContext(browser);
        const { adminER, mainER, myRequest, form } = ctx;

        const description = `${TD.description} [AUTO] ${generateTimestamp()}`;
        let newCR = '';

        try {
          logPhase(
            'PHASE 1',
            'ADMIN — Create Editable Rule R2 (Accepted Any Value)',
            'R2: BASICGENERAL.division → BASICGENERAL.productOldID'
          );

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
            'REQUESTOR — Verify disable on any Division value, submit',
            'Division=0001 → Old Material Number disabled; Submit → SUBMITTED'
          );

          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);

          await mainER.verifyLabelVisible('Division');

          await verifyDisable(mainER, {
            targetArea: 'Basic Data',
            targetNth: 1,
            source: {
              type: 'f4',
              f4Nth: 5,
              searchValue: '0001',
              selectColumnIndex: 1,
              selectBySearchValue: true,
            },
          });

          newCR = await form.submit(suiteConfig.comments.requestorSubmit);

          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');
          await myRequest.cancelCR(newCR);

          logPhase('PHASE 3', 'CLEANUP');

          await adminER.deleteRule('productOldID');
        } finally {
          await safeDeleteEditableRule(adminER, 'productOldID');
        }
      }
    );
  }
);
