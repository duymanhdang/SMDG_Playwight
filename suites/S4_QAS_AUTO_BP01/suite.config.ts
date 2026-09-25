/**
 * S4_QAS_AUTO_BP01 Suite Configuration
 *
 * Centralizes all suite-level constants:
 * - Template keys
 * - Source CRs
 * - Test data reference
 * - Dynamic data resolution
 *
 * Usage in test files:
 *   import { suiteConfig, getTestData } from '../suite.config'
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  generateBPName,
  generateSearchTerm,
  generateEmail,
  generatePhone,
  generateNotes,
} from '../../helpers/data';

// Load suite data JSON
const dataPath = path.join(__dirname, 'data', 'suite-data.json');
const rawData = fs.readFileSync(dataPath, 'utf-8');
const suiteDataRaw = JSON.parse(rawData);

// Resolve DYNAMIC placeholders
function resolveDynamicValue(value: string): string {
  if (value !== 'DYNAMIC') return value;

  const generators: Record<string, () => string> = {
    bpName: generateBPName,
    searchTerm: generateSearchTerm,
    email: generateEmail,
    telephone: generatePhone,
    mobilePhone: generatePhone,
    faxNumber: () => generatePhone().slice(0, 10),
    notes: () => generateNotes('Automation'),
  };

  return (generators[value] || (() => value))();
}

function resolveTestData(data: any): any {
  const resolved = { ...data };

  // Remove _dynamic meta field
  delete resolved._dynamic;

  // Resolve generalData
  if (resolved.generalData) {
    if (resolved.generalData.bpName === 'DYNAMIC') {
      resolved.generalData.bpName = generateBPName();
    }
    if (resolved.generalData.searchTerm === 'DYNAMIC') {
      resolved.generalData.searchTerm = generateSearchTerm();
    }
  }

  // Resolve address
  if (resolved.address) {
    if (resolved.address.email === 'DYNAMIC') {
      resolved.address.email = generateEmail();
    }
    if (resolved.address.telephone === 'DYNAMIC') {
      resolved.address.telephone = generatePhone();
    }
    if (resolved.address.mobilePhone === 'DYNAMIC') {
      resolved.address.mobilePhone = generatePhone();
    }
    if (resolved.address.faxNumber === 'DYNAMIC') {
      resolved.address.faxNumber = generatePhone().slice(0, 10);
    }
  }

  return resolved;
}

export const suiteData = suiteDataRaw;

// Suite-level constants
export const suiteConfig = {
  // Environment
  environment: 'QAS' as const,
  baseUrl: process.env.BASE_URL || '',

  // Accounts (from .env)
  accounts: {
    requestor: {
      user: process.env.SAP_USER || '',
      pass: process.env.SAP_PASS || '',
    },
    approver: {
      user: process.env.APPROVER_USER || '',
      pass: process.env.APPROVER_PASS || '',
    },
    steward: {
      user: process.env.STEWARD_USER || '',
      pass: process.env.STEWARD_PASS || '',
    },
    approver2: {
      user: process.env.APPROVER2_USER || '',
      pass: process.env.APPROVER2_PASS || '',
    },
    admin: {
      user: process.env.ADMIN_USER || '',
      pass: process.env.ADMIN_PASS || '',
    },
  },

  // Templates
  templates: {
    AUTO_BP01: {
      key: '6e666348-ff4a-4088-8287-274a92ab326c',
      name: 'AUTO_BP01',
      objectType: 'Business Partner',
    },
  },

  // Source CRs for copy operations
  sourceCRs: {
    default: 'CR0000027064',
  },

  // Standard comments
  comments: {
    requestorSubmit: 'Automation: Requestor has submitted this request',
    approverApprove: 'Automation: Approver has approved this request',
    approverReject: 'Automation: Approver has rejected this request - please review',
    approverRework: 'Automation: Approver has reworked this request to Requestor',
    stewardActivate: 'Automation: Steward has activated this request',
    stewardReworkToApprover: 'Automation: Steward reworks this request to approver',
  },

  // Timeouts (ms)
  timeouts: {
    e2eTest: 600000, // 10 minutes for full E2E tests
    phaseTimeout: 180000, // 3 minutes per phase
    statusWait: 240000, // 4 minutes max status wait
  },
};

// Helper to get test data for a specific TC (with DYNAMIC values resolved)
export function getTestData(tcKey: string) {
  const data = suiteDataRaw.testData[tcKey];
  if (!data) throw new Error(`Test data not found for key: ${tcKey}`);
  return resolveTestData(data);
}
