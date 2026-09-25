import * as fs from 'fs';
import * as path from 'path';
import { generateMMTimestamp, generateUniqueMMTimestamp } from '../../helpers/data';

const dataPath = path.join(__dirname, 'data', 'suite-data.json');
const rawData = fs.readFileSync(dataPath, 'utf-8');
const suiteDataRaw = JSON.parse(rawData);

export const suiteData = suiteDataRaw;

export const suiteConfig = {
  environment: 'QAS' as const,
  baseUrl: process.env.BASE_URL || '',

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

  templates: {
    AUTO_MM01_ASSIGNMENT_RULE: {
      name: 'AUTO_MM01_ASSIGNMENT_RULE',
      objectType: 'Product',
    },
  },

  comments: {
    requestorSubmit: 'Automation: Requestor has submitted this request',
    approverApprove: 'Automation: Approver has approved this request',
    approverReject: 'Automation: Approver has rejected this request - please review',
    approverRework: 'Automation: Approver has reworked this request to Requestor',
    stewardActivate: 'Automation: Steward has activated this request',
  },

  timeouts: {
    e2eTest: 600000,
    phaseTimeout: 180000,
    statusWait: 240000,
  },
};

export function getTestData(tcKey: string) {
  const data = suiteDataRaw.testData[tcKey];
  if (!data) throw new Error(`Test data not found for key: ${tcKey}`);
  return data;
}

export function generateTimestamp(): string {
  return generateUniqueMMTimestamp();
}
