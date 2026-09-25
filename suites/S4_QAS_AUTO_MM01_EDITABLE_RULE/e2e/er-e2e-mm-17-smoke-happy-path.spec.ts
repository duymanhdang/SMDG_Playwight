import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupEr';
import { createEditableRuleBySourceField, safeDeleteEditableRule } from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { verifyDisable, verifyReEnable } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('er-e2e-mm-17');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-17: E2E Smoke - Editable Rule Happy Path',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'Admin: Create R7 -> Requestor: Verify disable/enable -> Submit -> Cleanup',
      { tag: ['@smoke', '@happy-path', '@TC-16'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await setupTestContext(browser);
        const { adminER, mainER, myRequest, form } = ctx;

        const description = `${TD.description} [AUTO] ${generateTimestamp()}`;
        let newCR = '';

        try {
          logPhase(
            'PHASE 1',
            'ADMIN — Create Editable Rule R7',
            'R7: BASICDIMENSION.materialVolume → BASICDIMENSION.productStandardID (value=1)'
          );

          await loginBoth(ctx);
          await createEditableRuleBySourceField(adminER, TEMPLATE_NAME, {
            sourceSection: 'BASICDIMENSION',
            sourceField: 'materialVolume',
            targetSection: 'BASICDIMENSION',
            targetField: 'productStandardID',
            sourceValue: '1',
          });

          logPhase(
            'PHASE 2',
            'REQUESTOR — E2E Smoke Test',
            'Flow: Copy CR → Dimensions/EANs → Volume=1 → verify target disabled → Volume=2 → enabled → Submit'
          );

          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);

          await mainER.verifyHeadingVisible('Dimensions/EANs');
          await mainER.verifyLabelVisible('Volume');

          await verifyDisable(mainER, {
            targetNth: 7,
            source: { type: 'label', label: 'Volume', value: '1' },
          });

          await verifyReEnable(mainER, {
            targetNth: 7,
            source: { type: 'label', label: 'Volume', value: '2' },
          });

          newCR = await form.submit(suiteConfig.comments.requestorSubmit);

          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');
          await myRequest.cancelCR(newCR);

          logPhase('PHASE 3', 'CLEANUP — Delete Editable Rule');

          await adminER.deleteRule('productStandardID');
        } finally {
          await safeDeleteEditableRule(adminER, 'productStandardID');
        }
      }
    );
  }
);
