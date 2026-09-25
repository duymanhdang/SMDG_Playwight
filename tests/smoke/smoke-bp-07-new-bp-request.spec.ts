import { test, expect } from '@playwright/test';
import { getTestData } from '../../suites/S4_QAS_AUTO_BP01/suite.config';

const TD = getTestData('smoke-bp-07');
import { MyRequestPage } from '../../pages/cr/MyRequestPage';
import { CopyRequestForm } from '../../pages/cr/CopyRequestForm';
import { MyInboxPage } from '../../pages/cr/MyInboxPage';
import { ActivationPage } from '../../pages/activation/ActivationPage';
import { BPRequestForm } from '../../pages/cr/BPRequestForm';
import { ApproverActions, createApproverActions } from '../../pages/actions/ApproverActions';
import { StewardActions, createStewardActions } from '../../pages/actions/StewardActions';

/**
 * TC07 — New BP Request Full Flow
 *
 * Scenario: Create new BP → Approve → Activate
 *
 * Flow:
 *   [Requestor] New Request → Select BP template → Fill form → Submit → SUBMITTED
 *   [Approver]  My Inbox → Approve → left inbox
 *   [Steward]   Activation → UNASSIGNED → Assign → Approve → ACTIVATED
 */
test.describe('SMOKE-07: New Request → Approve → Steward Activate', { tag: ['@bp'] }, () => {
  test.describe('Full flow checks', { tag: ['@bp'] }, () => {
    test(
      '01 - Create BP → Approve → Activate',
      { tag: ['@smoke', '@workflow', '@happy-path'] },
      async ({ page }) => {
        test.setTimeout(360000); // 6 phút — form BP phức tạp + 3 roles

        const myRequest = new MyRequestPage(page);
        const bpForm = new BPRequestForm(page);
        let newCR = '';

        await test.step('Phase 1 - Requestor create and submit BP CR', async () => {
          console.log('');
          console.log('══════════════════════════════════════');
          console.log('  PHASE 1: REQUESTOR — Create New BP');
          console.log('══════════════════════════════════════');

          await myRequest.login();
          await myRequest.goto();

          // Mở New Request → chọn Business Partner → chọn template
          await bpForm.openNewRequest('Business Partner');
          await bpForm.selectTemplate('AUTO_BP01');

          // Fill header fields using MyRequestPage (works for New Request too)
          await myRequest.fillHeader({
            description: TD.description,
            priority: TD.priority,
            reason: TD.reason,
            notes: TD.notes,
          });

          // Fill General data tab
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

          // Fill Address tab
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

          // Fill Vendor Company Code tab
          await bpForm.addVendorCompanyCode(
            TD.vendorCompanyCode.companyCode.keyword,
            TD.vendorCompanyCode.companyCode.value,
            TD.vendorCompanyCode.reconciliationAcc,
            TD.vendorCompanyCode.reconciliationAcc,
            TD.vendorCompanyCode.paymentTerms,
            TD.vendorCompanyCode.paymentTerms
          );

          // Fill Purchasing Data tab
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

          // Fill Customer Company Code tab
          await bpForm.addCustomerCompanyCode(
            TD.customerCompanyCode.companyCode,
            TD.customerCompanyCode.companyCode,
            TD.customerCompanyCode.reconciliationAcc,
            TD.customerCompanyCode.reconciliationAcc,
            TD.customerCompanyCode.paymentTerms,
            TD.customerCompanyCode.paymentTerms
          );

          // Fill Sales Data tab
          await bpForm.addSalesData(
            TD.salesData.salesOrg,
            TD.salesData.salesDistrict,
            TD.salesData.customerGroup,
            TD.salesData.currency,
            TD.salesData.priceGroup,
            TD.salesData.paymentTerms,
            TD.salesData.acctAssmtGrpCust
          );

          // Remove Relationships row
          await bpForm.removeRelationship();

          // Submit
          newCR = await bpForm.submit();

          // Verify SUBMITTED
          const searchField = page.getByRoleUI5('SearchField');
          await myRequest.waitForStatus(newCR, 'SUBMITTED');
          await myRequest.verifyStatus(newCR, 'SUBMITTED');

          console.log('');
          console.log(`✅ PHASE 1 COMPLETE — CR ${newCR} status: SUBMITTED`);
        });

        await test.step('Phase 2 - Approver approve CR', async () => {
          console.log('');
          console.log('══════════════════════════════════════');
          console.log('  PHASE 2: APPROVER — Approve CR');
          console.log('══════════════════════════════════════');

          const myInbox = new MyInboxPage(page);
          const approver = createApproverActions(page);

          await myInbox.loginAs(process.env.APPROVER_USER || '', process.env.APPROVER_PASS || '');
          await myInbox.goto();
          await myInbox.searchCR(newCR);
          await myInbox.waitForCR(newCR);
          await myInbox.openCRDetail(newCR);
          await approver.approve(newCR);
          await myInbox.verifyCRLeft(newCR);

          console.log('');
          console.log(`✅ PHASE 2 COMPLETE — CR ${newCR} approved`);
        });

        await test.step('Phase 3 - Steward activate CR', async () => {
          console.log('');
          console.log('══════════════════════════════════════');
          console.log('  PHASE 3: STEWARD — Activate CR');
          console.log('══════════════════════════════════════');

          const activation = new ActivationPage(page);
          const steward = createStewardActions(page);

          await activation.loginAs(process.env.STEWARD_USER || '', process.env.STEWARD_PASS || '');
          await activation.goto();
          await steward.search(newCR);
          await steward.verifyStatus('UNASSIGNED');
          await steward.assign(newCR);
          await steward.verifyStatus('ASSIGNED');
          await steward.approve(newCR);
          await steward.verifyStatus('INPROGRESS');
          await steward.waitForActivated(newCR);
          await steward.verifyStatus('ACTIVATED');
        });

        console.log('');
        console.log('══════════════════════════════════════');
        console.log(`✅ TC07 PASSED`);
        console.log(`   CR: ${newCR}`);
        console.log(`   Flow: NEW BP → SUBMITTED → APPROVED → ACTIVATED`);
        console.log('══════════════════════════════════════');
      }
    );
  });
});
