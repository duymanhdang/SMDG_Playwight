// setup/index.ts intentionally does NOT re-export testSetup, testSetupEr, testSetupMr
// because they all export the same names (TestContext, setupTestContext, loginBoth) 
// with different implementations. Import from the specific file instead:
//   - helpers/setup/testSetup    (DuplicationRule tests)
//   - helpers/setup/testSetupEr  (EditableRule tests)
//   - helpers/setup/testSetupMr  (MandatoryRule tests)
