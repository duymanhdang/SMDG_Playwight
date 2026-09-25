import { test, expect } from '@playwright/test';
import { MyRequestPage } from '../../../pages/cr/MyRequestPage';
import { MyInboxPage } from '../../../pages/cr/MyInboxPage';
import { ActivationPage } from '../../../pages/activation/ActivationPage';
import { NewRequestForm } from '../../../pages/cr/NewRequestForm';
import { BPRequestForm } from '../../../pages/cr/BPRequestForm';
import { loginAs } from '../../../helpers/auth';
import { suiteConfig, getTestData } from '../suite.config';
import { ApproverActions, createApproverActions } from '../../../pages/actions/ApproverActions';
import { StewardActions, createStewardActions } from '../../../pages/actions/StewardActions';

/**
 * E2E-TC01: Create New BP → Approve → Activate
 * Suite: S4_QAS_AUTO_BP01
 *
 * Skills used:
 *   - create-bp-request.md
 *   - approve-cr.md
 *   - activate-cr.md
 *   - verify-status.md
 *
 * Flow:
 *   [Requestor] New Request → Fill BP form → Submit → verify SUBMITTED
 *   [Approver]  My Inbox → Approve → verify left inbox
 *   [Requestor] My Request → verify APPROVED          ← cross-verify
 *   [Steward]   Activation → Assign → Approve → verify ACTIVATED
 *   [Requestor] My Request → verify APPROVED + ACTIVATED ← cross-verify
 *
 * Multi-context: 3 browser contexts — session isolation per role
 */

const TD = getTestData('e2e-bp-01');

test.describe(
  'E2E-BP-01: New Request → Approve → Activate',
  { tag: ['@cr', '@bp', '@bp:bp-cr-lifecycle'] },
  () => {
    test(
      'Full flow: New BP request lifecycle',
      { tag: ['@workflow', '@happy-path', '@TC-01'] },
      async ({ browser }) => {
        test.setTimeout(suiteConfig.timeouts.e2eTest);

        // ── Setup: 3 contexts độc lập ─────────────────────────────────────────
        const requestorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const approverCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const stewardCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

        const requestorPage = await requestorCtx.newPage();
        const approverPage = await approverCtx.newPage();
        const stewardPage = await stewardCtx.newPage();

        // Label pages for easy identification
        await requestorPage.evaluate(() => {
          document.title = '[REQUESTOR] SimpleMDG';
        });
        await approverPage.evaluate(() => {
          document.title = '[APPROVER] SimpleMDG';
        });
        await stewardPage.evaluate(() => {
          document.title = '[STEWARD] SimpleMDG';
        });

        // Page Objects - for navigation
        const myRequest = new MyRequestPage(requestorPage);
        const bpForm = new BPRequestForm(requestorPage);
        const myInbox = new MyInboxPage(approverPage);
        const activation = new ActivationPage(stewardPage);

        // Action Classes - for actions
        const approver = createApproverActions(approverPage);
        const steward = createStewardActions(stewardPage);

        let newCR = '';

        try {
          // ════════════════════════════════════════════════════════════════════
          // PHASE 1: REQUESTOR — Create and Submit New BP Request
          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 1: REQUESTOR — Create New BP');
          console.log('══════════════════════════════════════');

          await myRequest.login();
          await myRequest.goto();

          // Open New Request
          await bpForm.openNewRequest(suiteConfig.templates.AUTO_BP01.objectType);
          await bpForm.selectTemplate(suiteConfig.templates.AUTO_BP01.name);

          // Fill Header using MyRequestPage
          await myRequest.fillHeader({
            description: TD.description,
            priority: TD.priority,
            reason: TD.reason,
            notes: TD.notes,
          });

          // Fill General data
          await bpForm.goToGeneralData();
          await bpForm.selectSupplierAccountGroup(
            TD.generalData.supplierAccountGroup.keyword,
            TD.generalData.supplierAccountGroup.value
          );
          await bpForm.selectCustomerAccountGroup(
            TD.generalData.customerAccountGroup.keyword,
            TD.generalData.customerAccountGroup.value
          );
          await bpForm.fillBPName(TD.generalData.bpName);
          await bpForm.fillSearchTerm(TD.generalData.searchTerm);

          // Fill Address
          await bpForm.goToAddress();
          await bpForm.fillHouseNumber(TD.address.houseNumber);
          await bpForm.fillStreetName(TD.address.streetName);
          await bpForm.fillPostalCode(TD.address.postalCode);
          await bpForm.fillCity(TD.address.city);
          await bpForm.selectCountry(TD.address.country.keyword, TD.address.country.value);
          await bpForm.selectRegion(TD.address.region.keyword, TD.address.region.value);
          await bpForm.fillCompanyPostalCode(TD.address.companyPostalCode);
          await bpForm.addContactRow('Telephone', TD.address.telephone);
          await bpForm.addContactRow('Mobile Phone', TD.address.mobilePhone);
          await bpForm.addContactRow('Fax Number', TD.address.faxNumber);
          await bpForm.addContactRow('Email Address', TD.address.email);

          // Fill Vendor Company Code
          await bpForm.addVendorCompanyCode(
            TD.vendorCompanyCode.companyCode.keyword,
            TD.vendorCompanyCode.companyCode.value,
            TD.vendorCompanyCode.reconciliationAcc,
            TD.vendorCompanyCode.reconciliationAcc,
            TD.vendorCompanyCode.paymentTerms,
            TD.vendorCompanyCode.paymentTerms
          );

          // Fill Purchasing Data
          await bpForm.addPurchasingData(
            TD.purchasingData.purchasingOrg,
            TD.purchasingData.purchasingGroup,
            TD.purchasingData.currency.keyword,
            TD.purchasingData.currency.value,
            TD.purchasingData.paymentTerms,
            TD.purchasingData.incoterms,
            TD.purchasingData.incotermsLocation,
            TD.purchasingData.partnerBP
          );

          // Fill Customer Company Code
          await bpForm.addCustomerCompanyCode(
            TD.customerCompanyCode.companyCode,
            TD.customerCompanyCode.companyCode,
            TD.customerCompanyCode.reconciliationAcc,
            TD.customerCompanyCode.reconciliationAcc,
            TD.customerCompanyCode.paymentTerms,
            TD.customerCompanyCode.paymentTerms
          );

          // Fill Sales Data
          await bpForm.addSalesData(
            TD.salesData.salesOrg,
            TD.salesData.salesDistrict,
            TD.salesData.customerGroup,
            TD.salesData.currency,
            TD.salesData.priceGroup,
            TD.salesData.paymentTerms,
            TD.salesData.acctAssmtGrpCust
          );

          // Remove Relationships
          await bpForm.removeRelationship();

          // Submit
          newCR = await bpForm.submit(suiteConfig.comments.requestorSubmit);
          console.log(`[Requestor] CR created: ${newCR}`);

          // Verify SUBMITTED
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterSubmit);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterSubmit);

          console.log(`\n✅ PHASE 1 COMPLETE — CR ${newCR} → ${TD.expectedStatuses.afterSubmit}`);

          // ════════════════════════════════════════════════════════════════════
          // PHASE 2: APPROVER — Approve CR
          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 2: APPROVER — Approve CR');
          console.log('══════════════════════════════════════');

          await loginAs(
            approverPage,
            suiteConfig.accounts.approver.user,
            suiteConfig.accounts.approver.pass
          );
          await myInbox.goto();
          await myInbox.searchCR(newCR);
          await myInbox.openCRDetail(newCR);
          await approver.approve(newCR);
          await myInbox.verifyCRLeft(newCR);

          console.log(`\n✅ PHASE 2 COMPLETE — CR ${newCR} approved`);

          // ── Cross-verify: Requestor verify APPROVED ────────────────────────
          console.log('\n── Cross-verify: Requestor verify APPROVED ──');
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterApprove);
          await myRequest.verifyStatus(newCR, TD.expectedStatuses.afterApprove);
          console.log(`✅ Cross-verify: CR ${newCR} → ${TD.expectedStatuses.afterApprove}`);

          // ════════════════════════════════════════════════════════════════════
          // PHASE 3: STEWARD — Activate CR
          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════════');
          console.log('  PHASE 3: STEWARD — Activate CR');
          console.log('══════════════════════════════════════');

          await loginAs(
            stewardPage,
            suiteConfig.accounts.steward.user,
            suiteConfig.accounts.steward.pass
          );
          await activation.goto();
          await steward.search(newCR);
          await steward.verifyStatus('UNASSIGNED');
          await steward.assign(newCR);
          await steward.verifyStatus('ASSIGNED');
          await steward.approve(newCR);
          await steward.verifyStatus('INPROGRESS');
          await steward.waitForActivated(newCR);
          await steward.verifyStatus(TD.expectedStatuses.activationStatus);

          console.log(
            `\n✅ PHASE 3 COMPLETE — CR ${newCR} → ${TD.expectedStatuses.activationStatus}`
          );

          // ── Cross-verify: Requestor verify APPROVED + ACTIVATED ───────────
          console.log('\n── Cross-verify: Requestor verify APPROVED + ACTIVATED ──');
          await myRequest.goto();
          await myRequest.waitForStatus(newCR, TD.expectedStatuses.afterApprove);
          await myRequest.verifyBothStatuses(
            newCR,
            TD.expectedStatuses.afterApprove,
            TD.expectedStatuses.activationStatus
          );
          console.log(`✅ Cross-verify: CR ${newCR} → APPROVED + ACTIVATED`);

          // ════════════════════════════════════════════════════════════════════
          console.log('\n══════════════════════════════════════');
          console.log(`✅ E2E-TC01 PASSED`);
          console.log(`   CR: ${newCR}`);
          console.log(`   Flow: NEW BP → SUBMITTED → APPROVED → ACTIVATED`);
          console.log(`   Cross-role verify: ✓ APPROVED, ✓ ACTIVATED`);
          console.log('══════════════════════════════════════');
        } finally {
          console.log('\n[Cleanup] Closing all contexts...');
          await requestorCtx.close();
          await approverCtx.close();
          await stewardCtx.close();
          console.log('[Cleanup] ✅ All contexts closed');
        }
      }
    );
  }
);
