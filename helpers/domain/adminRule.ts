import { AdminDuplicationRulePage } from '../../pages/admin/AdminDuplicationRulePage';
import { logPhase } from '../utils/logUtils';

export interface RuleParams {
  sourceSection: string;
  sourceField: string;
  targetSection: string;
  targetField: string;
}

export async function createDuplicationRule(
  adminDR: AdminDuplicationRulePage,
  templateName: string,
  rule: RuleParams,
): Promise<void> {
  logPhase('PHASE 1', 'ADMIN — Create Duplication Rule',
    `${rule.sourceSection}.${rule.sourceField} → ${rule.targetSection}.${rule.targetField}`);
  await adminDR.navigateToDuplicationRule(templateName);
  await adminDR.createDuplicationRule({
    sourceSection: rule.sourceSection,
    sourceField: rule.sourceField,
    targetSection: rule.targetSection,
    targetField: rule.targetField,
  });
  await adminDR.verifyToast('Business Rule Created');
}

export async function deleteDuplicationRule(
  adminDR: AdminDuplicationRulePage,
  sourceSection: string,
  targetField: string,
): Promise<void> {
  console.log(`[Cleanup] Delete rule: ${sourceSection}/${targetField}`);
  await adminDR.deleteDuplicationRule(sourceSection, targetField);
}

export async function safeDeleteDuplicationRule(
  adminDR: AdminDuplicationRulePage,
  sourceSection: string,
  targetField: string,
): Promise<void> {
  try {
    await deleteDuplicationRule(adminDR, sourceSection, targetField);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[Cleanup] Delete rule error: ${msg}`);
  }
}
