import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupEr';
import {
  createEditableRuleBySourceField,
  addAnotherEditableRuleBySourceField,
  safeDeleteEditableRule,
} from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { verifyDisable } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('er-e2e-mm-07');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-07: Main Structural Validation (Section Combinations)',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'R2 (BasicData→BasicData) + R7 (Dimensions→Dimensions) — independent, no conflict',
      { tag: ['@happy-path', '@TC-06'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await setupTestContext(browser);
        const { adminER, mainER, myRequest, form } = ctx;

        const description = `${TD.description} [AUTO] ${generateTimestamp()}`;
        const fieldsToClean = ['productOldID', 'productStandardID'];
        let newCR = '';

        try {
          logPhase(
            'PHASE 1',
            'ADMIN — Create both Editable Rules',
            'R2: BASICGENERAL.division → productOldID (*), R7: BASICDIMENSION.materialVolume → productStandardID (value=1)'
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

          await addAnotherEditableRuleBySourceField(adminER, {
            sourceSection: 'BASICDIMENSION',
            sourceField: 'materialVolume',
            targetSection: 'BASICDIMENSION',
            targetField: 'productStandardID',
            sourceValue: '1',
          });

          logPhase(
            'PHASE 2',
            'REQUESTOR — Verify R2 in Basic Data',
            'Division=0001 → Old Material Number disabled'
          );

          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);

          await mainER.verifyTitleVisible('Basic Data');
          await mainER.verifyLabelVisible('Division');

          await verifyDisable(mainER, {
            targetNth: 1,
            source: {
              type: 'f4',
              f4Nth: 5,
              searchValue: '0001',
              selectColumnIndex: 1,
              selectBySearchValue: true,
            },
          });

          logPhase(
            'PHASE 3',
            'REQUESTOR — Verify R7 in Dimensions/EANs',
            'Volume=1 → Product Standard ID disabled'
          );

          await mainER.navigateToTargetArea('Dimensions/EANs');
          await mainER.verifyLabelVisible('Volume');

          await mainER.fillInputByLabel('Volume', '1');
          await mainER.verifyNotEditableByIndex(7);

          logPhase('PHASE 4', 'REQUESTOR — Submit and verify');

          newCR = await form.submit(suiteConfig.comments.requestorSubmit);

          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');
          await myRequest.cancelCR(newCR);

          logPhase('PHASE 5', 'CLEANUP');

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
