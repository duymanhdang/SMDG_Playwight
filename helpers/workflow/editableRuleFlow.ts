import { MainEditableRuleVerifyPage } from '../../pages/verify/MainEditableRuleVerifyPage';
import { logPhase } from '../utils/logUtils';

export interface SourceF4Params {
  type: 'f4';
  f4Nth: number;
  searchValue: string;
  selectText?: string;
  selectColumnIndex?: number;
  selectBySearchValue?: boolean;
}

export interface SourceTextParams {
  type: 'text';
  nth: number;
  value: string;
}

export interface SourceLabelParams {
  type: 'label';
  label: string;
  value: string;
}

export interface VerifyDisableParams {
  targetArea?: string;
  targetNth: number;
  source: SourceF4Params | SourceTextParams | SourceLabelParams;
  inputType?: 'Input' | 'MultiInput';
}

export async function verifyDisable(
  mainER: MainEditableRuleVerifyPage,
  params: VerifyDisableParams,
): Promise<void> {
  logPhase('VERIFY', `Editable Rule: Fill source → verify target[${params.targetNth}] disabled`);

  if (params.targetArea) {
    await mainER.navigateToTargetArea(params.targetArea);
  }

  const s = params.source;
  switch (s.type) {
    case 'f4':
      await mainER.clickF4Icon(s.f4Nth);
      await mainER.searchF4(s.searchValue);
      if (s.selectColumnIndex !== undefined) {
        await mainER.selectF4FirstRowColumn(s.selectColumnIndex, s.selectBySearchValue ? s.searchValue : undefined);
      } else if (s.selectText) {
        await mainER.selectF4Text(s.selectText);
      }
      break;
    case 'text':
      await mainER.fillInput(s.nth, s.value);
      break;
    case 'label':
      await mainER.fillInputByLabel(s.label, s.value);
      break;
  }

  await mainER.verifyNotEditableByIndex(params.targetNth, params.inputType);
}

export async function verifyReEnable(
  mainER: MainEditableRuleVerifyPage,
  params: VerifyDisableParams,
): Promise<void> {
  logPhase('VERIFY', `Editable Rule: Change source → verify target[${params.targetNth}] enabled`);

  if (params.targetArea) {
    await mainER.navigateToTargetArea(params.targetArea);
  }

  const s = params.source;
  switch (s.type) {
    case 'f4':
      await mainER.clickF4Icon(s.f4Nth);
      await mainER.searchF4(s.searchValue);
      if (s.selectColumnIndex !== undefined) {
        await mainER.selectF4FirstRowColumn(s.selectColumnIndex, s.selectBySearchValue ? s.searchValue : undefined);
      } else if (s.selectText) {
        await mainER.selectF4Text(s.selectText);
      }
      break;
    case 'text':
      await mainER.fillInput(s.nth, s.value);
      break;
    case 'label':
      await mainER.fillInputByLabel(s.label, s.value);
      break;
  }

  await mainER.verifyEditableByIndex(params.targetNth, params.inputType);
}
