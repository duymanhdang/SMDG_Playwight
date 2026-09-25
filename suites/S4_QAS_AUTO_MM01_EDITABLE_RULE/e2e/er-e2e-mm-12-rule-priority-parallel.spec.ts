import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupEr';
import {
  createEditableRuleByUserAttribute,
  addAnotherEditableRuleBySourceField,
  safeDeleteEditableRule,
} from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('er-e2e-mm-12');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-12: Main Rule Priority in Parallel Execution',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'R1 (UserAttr) + R3 (SourceField) — both active, different targets',
      { tag: ['@happy-path', '@TC-11'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await setupTestContext(browser);
        const { adminER, mainER, myRequest, form } = ctx;

        const description = `${TD.description} [AUTO] ${generateTimestamp()}`;
        const fieldsToClean = ['alternativeUnit', 'loadingGroup'];
        let newCR = '';

        try {
          logPhase('PHASE 1', 'ADMIN — Create R1 (User Attribute) + R3 (Source Field)');
          await loginBoth(ctx);

          await createEditableRuleByUserAttribute(adminER, TEMPLATE_NAME, {
            attributeType: 'User ID',
            targetSection: 'UNITSOFMEASURE',
            targetField: 'alternativeUnit',
            sourceValue: 'smdg.prestage@proton.me',
          });

          await addAnotherEditableRuleBySourceField(adminER, {
            sourceSection: 'PLANTDATA',
            sourceField: 'replacementPart',
            targetSection: 'SHIPPINGDATATIMEINDAYS',
            targetField: 'loadingGroup',
            sourceValue: 'A',
          });

          logPhase('PHASE 2', 'REQUESTOR — Verify R1 (User Attribute) for current user');
          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);

          await mainER.navigateToTargetArea('Units of Measure');
          await mainER.verifyTextVisible('BAG');
          await mainER.clickOpenSectionButton(1);
          await mainER.verifyTitleVisible('Units of Measure');
          await mainER.verifyLabelVisible('Alternative Unit');
          await mainER.verifyNotEditableByIndex(0, 'MultiInput');

          await mainER.closeDialog();

          logPhase('PHASE 3', 'REQUESTOR — Verify R3 (PlantData→ShippingData)');
          await mainER.navigateToTargetArea('Plant Data');
          await mainER.verifyTitleVisible('Plant Data');
          await mainER.clickOpenSectionButton(22);
          await mainER.verifyTitleVisible('Plant Data');
          await mainER.verifyLabelVisible('Replacement Part');

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
