import { AdminEditableRulePage } from '../../pages/admin/AdminEditableRulePage';
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

export async function createEditableRuleBySourceField(
  adminER: AdminEditableRulePage,
  templateName: string,
  rule: SourceFieldRuleParams,
): Promise<void> {
  logPhase('PHASE 1', 'ADMIN — Create Editable Rule (Source Field)',
    `${rule.sourceSection}.${rule.sourceField} → ${rule.targetSection}.${rule.targetField}`);
  await adminER.navigateToEditableRule(templateName);
  await adminER.createRuleBySourceField(
    rule.sourceSection,
    rule.sourceField,
    rule.targetSection,
    rule.targetField,
    rule.sourceValue,
    rule.acceptedAnyValue,
  );
  await adminER.verifyToast('Business Rule Created');
}

export async function addAnotherEditableRuleByUserAttribute(
  adminER: AdminEditableRulePage,
  rule: UserAttributeRuleParams,
): Promise<void> {
  logPhase('PHASE 1', 'ADMIN — Add another Editable Rule (User Attribute)',
    `${rule.attributeType} → ${rule.targetSection}.${rule.targetField}`);
  await adminER.createRuleByUserAttribute(
    rule.attributeType,
    rule.targetSection,
    rule.targetField,
    rule.sourceValue,
    rule.acceptedAnyValue,
  );
  await adminER.verifyToast('Business Rule Created');
}

export async function addAnotherEditableRuleBySourceField(
  adminER: AdminEditableRulePage,
  rule: SourceFieldRuleParams,
): Promise<void> {
  logPhase('PHASE 1', 'ADMIN — Add another Editable Rule (Source Field)',
    `${rule.sourceSection}.${rule.sourceField} → ${rule.targetSection}.${rule.targetField}`);
  await adminER.createRuleBySourceField(
    rule.sourceSection,
    rule.sourceField,
    rule.targetSection,
    rule.targetField,
    rule.sourceValue,
    rule.acceptedAnyValue,
  );
  await adminER.verifyToast('Business Rule Created');
}

export async function createEditableRuleByUserAttribute(
  adminER: AdminEditableRulePage,
  templateName: string,
  rule: UserAttributeRuleParams,
): Promise<void> {
  logPhase('PHASE 1', 'ADMIN — Create Editable Rule (User Attribute)',
    `${rule.attributeType} → ${rule.targetSection}.${rule.targetField}`);
  await adminER.navigateToEditableRule(templateName);
  await adminER.createRuleByUserAttribute(
    rule.attributeType,
    rule.targetSection,
    rule.targetField,
    rule.sourceValue,
    rule.acceptedAnyValue,
  );
  await adminER.verifyToast('Business Rule Created');
}

export async function deleteEditableRule(
  adminER: AdminEditableRulePage,
  targetField: string,
): Promise<void> {
  console.log(`[Cleanup] Delete Editable Rule for target "${targetField}"`);
  await adminER.deleteRule(targetField);
}

export async function safeDeleteEditableRule(
  adminER: AdminEditableRulePage,
  targetField: string,
): Promise<void> {
  await adminER.safeDeleteRule(targetField);
}
