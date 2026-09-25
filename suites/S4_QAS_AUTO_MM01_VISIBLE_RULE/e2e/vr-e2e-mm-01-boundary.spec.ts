import { test, Browser, BrowserContext } from '@playwright/test';
import { AdminVisibleRulePage } from '../../../pages/admin/AdminVisibleRulePage';
import { MainVisibleRuleVerifyPage } from '../../../pages/verify/MainVisibleRuleVerifyPage';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, suiteData, getTestData, generateTimestamp } from '../suite.config';
import { openCopyRequestAndFillHeader } from '../../../helpers/workflow/crFlow';
import { submitCRWithConfirm } from '../../../helpers/workflow/workflow';

const TD = getTestData('vr-e2e-mm-01') as any;

test.describe.serial(
  'VR-E2E-MM-01: Boundary Tests — R1-R5 Per-Rule',
  { tag: ['@rules', '@visible-rule', '@mm', '@bp:visible-rule'] },
  () => {
    let adminCtx: BrowserContext;
    let requestorCtx: BrowserContext;
    let adminPage: any;
    let requestorPage: any;
    let adminVR: AdminVisibleRulePage;
    let mainVR: MainVisibleRuleVerifyPage;
    let myRequest: MyRequestPage;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(suiteConfig.timeouts.e2eTest);

      adminCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      adminPage = await adminCtx.newPage();
      requestorPage = await requestorCtx.newPage();
      await adminPage.evaluate(() => {
        document.title = '[ADMIN] SimpleMDG';
      });
      await requestorPage.evaluate(() => {
        document.title = '[REQUESTOR] SimpleMDG';
      });

      adminVR = new AdminVisibleRulePage(adminPage);
      mainVR = new MainVisibleRuleVerifyPage(requestorPage);
      myRequest = new MyRequestPage(requestorPage);

      await loginAs(adminPage, suiteConfig.accounts.admin.user, suiteConfig.accounts.admin.pass);
      await adminVR.navigateToVisibleRule(suiteConfig.templates.AUTO_MM01_VISIBLE_RULE.name);

      await loginAs(
        requestorPage,
        suiteConfig.accounts.requestor.user,
        suiteConfig.accounts.requestor.pass
      );
    });

    test.afterAll(async () => {
      await adminCtx.close();
      await requestorCtx.close();
    });

    for (const rule of TD.decisionTable) {
      const adminRule = (suiteData.rules as Record<string, any>)[rule.id];

      test(
        `R${rule.id}: Boundary + Happy Path — ${rule.sourceFieldLabel} → ${rule.targetFieldLabel}`,
        { tag: ['@data-driven', '@happy-path', '@TC-00'] },
        async () => {
          test.setTimeout(suiteConfig.timeouts.e2eTest);
          const description = `VR-01 R${rule.id}: ${rule.sourceFieldLabel} → ${rule.targetFieldLabel} [AUTO] ${generateTimestamp()}`;
          let newCR = '';

          try {
            // ═══════════════════════════════════════════════════
            //  PHASE 1: ADMIN — Create Rule R{rule.id}
            // ═══════════════════════════════════════════════════
            console.log(`\n======================================`);
            console.log(`  PHASE 1: ADMIN — Create R${rule.id}`);
            console.log(`======================================`);

            await adminVR.createVisibleRule({
              sourceSection: adminRule.sourceSection,
              sourceField: adminRule.sourceField,
              targetSection: adminRule.targetSection,
              targetField: adminRule.targetField,
              sourceValue: rule.sourceValue === 'any' ? undefined : rule.sourceValue,
              acceptedAnyValue: rule.sourceValue === 'any',
            });

            console.log(`-- [OK] PHASE 1 COMPLETE — R${rule.id} created --`);

            // ═══════════════════════════════════════════════════
            //  PHASE 2: REQUESTOR — Verify Rule
            // ═══════════════════════════════════════════════════
            console.log(`\n======================================`);
            console.log(`  PHASE 2: REQUESTOR — Verify R${rule.id}`);
            console.log(`======================================`);

            await openCopyRequestAndFillHeader(
              myRequest,
              TD.sourceCR,
              description,
              TD.header.priority
            );

            switch (rule.id) {
              // ── R1: PLANTDATA plant → GENERALPLANTDATASTORAGE plant ──────
              // Dialog-based: open Plant Data dialog → F4 Plant → switch to Plant Data/Storage Location → add row
              case 'R1': {
                await mainVR.navigateToTargetArea('Plant Data');
                await mainVR.clickOpenSectionButton(22);
                await mainVR.verifyDialogTitle('Plant Data');
                await mainVR.verifyFieldLabel('Plant');
                await mainVR.clickF4Icon(0);
                await mainVR.searchAndSelectF4('0001');
                await mainVR.selectF4ValueByXPathDialog(2);
                await mainVR.clickDialogTab('Plant Data/Storage Location');
                await mainVR.clickAddRowButton(0);
                await mainVR.verifyDialogTitle('Plant Data/Storage Location');
                await mainVR.verifyFieldLabel('Plant');
                await mainVR.closeDialog(1);
                await mainVR.closeDialog();
                break;
              }

              // ── R2: PLANTDATA replacementPart → SHIPPINGDATATIMEINDAYS loadingGroup ──
              // Dialog-based: open Plant Data dialog → F4 Replacement Part → switch to Shipping Data → verify LoadingGrp
              case 'R2': {
                await mainVR.navigateToTargetArea('Plant Data');
                await mainVR.clickOpenSectionButton(22);
                await mainVR.verifyDialogTitle('Plant Data');
                await mainVR.verifyFieldLabel('Replacement Part');
                await mainVR.clickF4Icon(1);
                await mainVR.searchAndSelectF4('A');
                await mainVR.selectF4Text('A');
                await mainVR.clickDialogTab('Shipping Data (Time in days)');
                await mainVR.verifyFieldLabel('LoadingGrp');
                await mainVR.updateDialog();
                break;
              }

              // ── R3: CONTROLDATA prodPlntFcstModSelProcedure → prodPlntFcstModSelMethod ──
              // Dialog-based: open Plant Data dialog → More → Forecasting → select combobox → verify Model selection
              case 'R3': {
                await mainVR.navigateToTargetArea('Plant Data');
                await mainVR.clickOpenSectionButton(22);
                await mainVR.verifyDialogTitle('Plant Data');
                await mainVR.clickDialogTab('More');
                await mainVR.clickOverflowTab('Forecasting');
                await mainVR.verifyFieldLabel('Selection procedure');
                await mainVR.clickDropdownIcon(2);
                await mainVR.selectDropdownItem('1');
                await mainVR.verifyFieldLabel('Model selection');
                await mainVR.updateDialog();
                break;
              }

              // ── R4: BASICTEXT longText → BASICTEXT language ──────────────
              // Direct form: fill textarea → verify MultiInput nth(15) visible
              case 'R4': {
                await mainVR.verifyHeading('Basic Data Texts');
                await mainVR.verifyFieldLabel('Basic Text / Language');
                await mainVR.fillTextAreaByLabel('Basic Text / Language', 'EN');
                await mainVR.verifyTargetMultiInputVisible(15);
                break;
              }

              // ── R5: BASICGENERAL laboratoryOrDesignOffice → PLANTDATA materialFreightGroup ──
              // Two-step: F4 Lab/Office on Basic Data → navigate to Plant Data → open dialog → verify Material freight grp
              case 'R5': {
                await mainVR.verifyDialogTitle('Basic Data ');
                await mainVR.verifyFieldLabel('Lab/Office');
                await mainVR.clickF4Icon(6);
                await mainVR.searchAndSelectF4('001');
                await mainVR.selectF4ValueByXPathDialog(1);
                await mainVR.navigateToTargetArea('Plant Data');
                await mainVR.clickOpenSectionButton(22);
                await mainVR.verifyDialogTitle('Plant Data');
                await mainVR.verifyFieldLabel('Material freight grp');
                await mainVR.closeDialog();
                break;
              }

              default:
                throw new Error(`Unknown rule id: ${rule.id}`);
            }

            console.log(`-- [OK] PHASE 2 COMPLETE — R${rule.id} verified --`);

            // ═══════════════════════════════════════════════════
            //  PHASE 3: REQUESTOR — Submit + Reopen + Verify Persistence
            // ═══════════════════════════════════════════════════
            console.log(`\n======================================`);
            console.log(`  PHASE 3: REQUESTOR — Submit + Verify`);
            console.log(`======================================`);

            newCR = await submitCRWithConfirm(requestorPage, suiteConfig.comments.requestorSubmit);
            console.log(`[Requestor] CR submitted: ${newCR}`);
            await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterSubmit);

            console.log(
              `-- [OK] PHASE 3 COMPLETE — CR ${newCR} -> ${TD.expectedStatuses.afterSubmit} --`
            );

            // ═══════════════════════════════════════════════════
            //  PHASE 4: REQUESTOR — Reopen CR + Verify Persistence
            // ═══════════════════════════════════════════════════
            console.log(`\n======================================`);
            console.log(`  PHASE 4: REQUESTOR — Reopen + Verify Persistence`);
            console.log(`======================================`);

            await myRequest.openCRDetail(newCR, 'Material Number');

            switch (rule.id) {
              case 'R1': {
                await mainVR.navigateToTargetArea('Plant Data');
                await mainVR.clickOpenSectionButton(22);
                await mainVR.verifyDialogTitle('Plant Data');
                await mainVR.clickDialogTab('Plant Data/Storage Location');
                await mainVR.verifyFieldLabel('Plant');
                await mainVR.closeDialog();
                break;
              }
              case 'R2': {
                await mainVR.navigateToTargetArea('Plant Data');
                await mainVR.clickOpenSectionButton(22);
                await mainVR.verifyDialogTitle('Plant Data');
                await mainVR.clickDialogTab('Shipping Data (Time in days)');
                await mainVR.verifyFieldLabel('LoadingGrp');
                await mainVR.closeDialog();
                break;
              }
              case 'R3': {
                await mainVR.navigateToTargetArea('Plant Data');
                await mainVR.clickOpenSectionButton(22);
                await mainVR.verifyDialogTitle('Plant Data');
                await mainVR.clickDialogTab('More');
                await mainVR.clickOverflowTab('Forecasting');
                await mainVR.verifyFieldLabel('Model selection');
                await mainVR.closeDialog();
                break;
              }
              case 'R4': {
                await mainVR.verifyFieldLabel('Basic Text / Language');
                break;
              }
              case 'R5': {
                await mainVR.navigateToTargetArea('Plant Data');
                await mainVR.clickOpenSectionButton(22);
                await mainVR.verifyDialogTitle('Plant Data');
                await mainVR.verifyFieldLabel('Material freight grp');
                await mainVR.closeDialog();
                break;
              }
            }

            console.log(`-- [OK] PHASE 4 COMPLETE — Target persists after submit --`);

            // ═══════════════════════════════════════════════════
            //  PHASE 5: REQUESTOR — Cancel CR
            // ═══════════════════════════════════════════════════
            console.log(`\n======================================`);
            console.log(`  PHASE 5: REQUESTOR — Cancel CR`);
            console.log(`======================================`);

            await myRequest.cancelCR(newCR);

            console.log(`-- [OK] PHASE 5 COMPLETE — CR ${newCR} cancelled --`);

            console.log(`\n======================================`);
            console.log(`[OK] R${rule.id} PASSED`);
            console.log(`======================================`);
          } finally {
            // ═══════════════════════════════════════════════════
            //  CLEANUP: Admin delete rule
            // ═══════════════════════════════════════════════════
            console.log(`\n[Cleanup] Deleting R${rule.id}...`);
            await adminVR.safeDeleteVisibleRule(adminRule.sourceSection, adminRule.targetField);
            console.log(`[Cleanup] [OK] R${rule.id} deleted`);
          }
        }
      );
    }
  }
);
