import { AdminMandatoryRulePage } from '../../pages/admin/AdminMandatoryRulePage';
import { logPhase } from '../utils/logUtils';

export interface SourceFieldRuleParams {
  sourceSection: string;
  sourceField: string;
  targetSection: string;
  targetField: string;
  sourceValue: string;
  acceptedAnyValue?: boolean;
}

export interface UserAttributeRuleParams {
  attributeType: string;
  targetSection: string;
  targetField: string;
  sourceValue?: string;
  acceptedAnyValue?: boolean;
}

export async function createMandatoryRuleBySourceField(
  adminMR: AdminMandatoryRulePage,
  templateName: string,
  rule: SourceFieldRuleParams,
): Promise<void> {
  logPhase('PHASE 1', 'ADMIN — Create Mandatory Rule (Source Field)',
    `${rule.sourceSection}.${rule.sourceField} → ${rule.targetSection}.${rule.targetField}`);
  await adminMR.navigateToMandatoryRule(templateName);
  await adminMR.createRuleBySourceField(
    rule.sourceSection,
    rule.sourceField,
    rule.targetSection,
    rule.targetField,
    rule.sourceValue,
    rule.acceptedAnyValue,
  );
  await adminMR.verifyToast('Business Rule Created');
}

export async function addAnotherMandatoryRuleBySourceField(
  adminMR: AdminMandatoryRulePage,
  rule: SourceFieldRuleParams,
): Promise<void> {
  logPhase('PHASE 1', 'ADMIN — Add another Mandatory Rule (Source Field)',
    `${rule.sourceSection}.${rule.sourceField} → ${rule.targetSection}.${rule.targetField}`);
  await adminMR.createRuleBySourceField(
    rule.sourceSection,
    rule.sourceField,
    rule.targetSection,
    rule.targetField,
    rule.sourceValue,
    rule.acceptedAnyValue,
  );
  await adminMR.verifyToast('Business Rule Created');
}

export async function createMandatoryRuleByUserAttribute(
  adminMR: AdminMandatoryRulePage,
  templateName: string,
  rule: UserAttributeRuleParams,
): Promise<void> {
  logPhase('PHASE 1', 'ADMIN — Create Mandatory Rule (User Attribute)',
    `${rule.attributeType} → ${rule.targetSection}.${rule.targetField}`);
  await adminMR.navigateToMandatoryRule(templateName);
  await adminMR.createRuleByUserAttribute(
    rule.attributeType,
    rule.targetSection,
    rule.targetField,
    rule.sourceValue,
    rule.acceptedAnyValue,
  );
  await adminMR.verifyToast('Business Rule Created');
}

export async function safeDeleteMandatoryRule(
  adminMR: AdminMandatoryRulePage,
  targetField: string,
): Promise<void> {
  await adminMR.safeDeleteRule(targetField);
}
