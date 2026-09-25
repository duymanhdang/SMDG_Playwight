import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupEr';
import {
  createEditableRuleBySourceField,
  addAnotherEditableRuleByUserAttribute,
  safeDeleteEditableRule,
} from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('er-e2e-mm-13');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-13: Main Value-Matching & User-Attribute Edge Cases',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'R3 (replacementPart=A → loadingGroup) + R1 (userID→alternativeUnit) — mixed types, verify both active',
      { tag: ['@happy-path', '@TC-12'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await setupTestContext(browser);
        const { adminER, mainER, myRequest, form } = ctx;

        const description = `${TD.description} [AUTO] ${generateTimestamp()}`;
        const fieldsToClean = ['loadingGroup', 'alternativeUnit'];
        let newCR = '';

        try {
          logPhase('PHASE 1', 'ADMIN — Create R3 (Source Field) + R1 (User Attribute)');
          await loginBoth(ctx);

          await createEditableRuleBySourceField(adminER, TEMPLATE_NAME, {
            sourceSection: 'PLANTDATA',
            sourceField: 'replacementPart',
            targetSection: 'SHIPPINGDATATIMEINDAYS',
            targetField: 'loadingGroup',
            sourceValue: 'A',
          });

          await addAnotherEditableRuleByUserAttribute(adminER, {
            attributeType: 'User ID',
            targetSection: 'UNITSOFMEASURE',
            targetField: 'alternativeUnit',
            sourceValue: 'smdg.prestage@proton.me',
          });

          logPhase('PHASE 2', 'REQUESTOR — Verify both rules apply independently');
          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);

          await mainER.navigateToTargetArea('Units of Measure');
          await mainER.verifyTextVisible('BAG');
          await mainER.clickOpenSectionButton(1);
          await mainER.verifyLabelVisible('Alternative Unit');
          await mainER.verifyNotEditableByIndex(0, 'MultiInput');
          await mainER.closeDialog();

          await mainER.navigateToTargetArea('Plant Data');
          await mainER.clickOpenSectionButton(22);
          await mainER.clickF4Icon(1);
          await mainER.searchF4('A');
          await mainER.selectF4Text('A');
          await mainER.switchDialogTab('Shipping Data (Time in days)');
          await mainER.verifyLabelVisible('LoadingGrp');
          await mainER.verifyNotEditableByIndex(5, 'MultiInput');
          await mainER.closeDialog();

          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');
          await myRequest.cancelCR(newCR);

          logPhase('PHASE 3', 'CLEANUP');
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
