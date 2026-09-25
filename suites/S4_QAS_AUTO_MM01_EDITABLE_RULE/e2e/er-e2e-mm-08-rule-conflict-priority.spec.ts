import { test } from '@playwright/test';
import { logPhase } from '../../../helpers/utils';
import { setupTestContext, loginBoth } from '../../../helpers/setup/testSetupEr';
import { createEditableRuleBySourceField, safeDeleteEditableRule } from '../../../helpers/domain';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow';
import { suiteConfig, getTestData, generateTimestamp } from '../suite.config';

const TD = getTestData('er-e2e-mm-08');
const TEMPLATE_NAME = suiteConfig.templates.AUTO_MM01_EDITABLE_RULE.name;

test.describe(
  'ER-E2E-MM-08: Main Rule Conflict Priority (vs Assignment Rule)',
  { tag: ['@rules', '@editable-rule', '@mm', '@bp:editable-rule'] },
  () => {
    test(
      'R6: ValuationCategory→PriceUnitQty — verify Editable Rule takes precedence over Assignment Rule',
      { tag: ['@happy-path', '@TC-07'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        const ctx = await setupTestContext(browser);
        const { adminER, mainER, myRequest, form } = ctx;

        const description = `${TD.description} [AUTO] ${generateTimestamp()}`;
        let newCR = '';

        try {
          logPhase(
            'PHASE 1',
            'ADMIN — Create Editable Rule R6',
            'R6: ACCOUNTINGANDCOSTING.valuationCategory → VALUATION.priceUnitQty (value=B)'
          );

          await loginBoth(ctx);
          await createEditableRuleBySourceField(adminER, TEMPLATE_NAME, {
            sourceSection: 'ACCOUNTINGANDCOSTING',
            sourceField: 'valuationCategory',
            targetSection: 'VALUATION',
            targetField: 'priceUnitQty',
            sourceValue: 'B',
          });

          logPhase('PHASE 2', 'REQUESTOR — Open CR, navigate to Accounting & Costing');
          await openCopyRequestAndFillHeader(myRequest, suiteConfig.sourceCRs.default, description);

          await mainER.navigateToTargetArea('Accounting & Costing');
          await mainER.verifyTitleVisible('Accounting & Costing');

          logPhase('PHASE 3', 'Fill ValuationCategory=B via F4');
          await mainER.clickOpenSectionButton(28);
          await mainER.verifyTitleVisible('Accounting & Costing');
          await mainER.verifyLabelVisible('Valuation Category');

          await mainER.clickF4Icon(3);
          await mainER.searchF4('B');
          await mainER.selectF4FirstRowColumn(2, 'B');

          logPhase('PHASE 4', 'Click Add → Valuation dialog → verify Price Unit not editable');
          await mainER.clickAddButton();
          await mainER.verifyTitleVisible('Valuation');
          await mainER.verifyLabelVisible('Price Unit');
          await mainER.verifyNotEditableByValue('1');

          logPhase('PHASE 5', 'Close 2 dialogs → Submit');
          await mainER.closeDialog(1);
          await mainER.closeDialog();

          newCR = await form.submit(suiteConfig.comments.requestorSubmit);
          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');
          await myRequest.cancelCR(newCR);

          logPhase('PHASE 6', 'CLEANUP');
          await adminER.deleteRule('priceUnitQty');
        } finally {
          await safeDeleteEditableRule(adminER, 'priceUnitQty');
        }
      }
    );
  }
);
