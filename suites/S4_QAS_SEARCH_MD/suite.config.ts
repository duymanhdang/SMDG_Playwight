import * as fs from 'fs';
import * as path from 'path';
import { generateMMTimestamp } from '../../helpers/data';

const dataPath = path.join(__dirname, 'data', 'suite-data.json');
const rawData = fs.readFileSync(dataPath, 'utf-8');
const suiteDataRaw = JSON.parse(rawData);

export const suiteData = suiteDataRaw;

export const suiteConfig = {
  environment: 'QAS' as const,
  baseUrl: process.env.BASE_URL || '',

  accounts: {
    admin: {
      user: process.env.ADMIN_USER || '',
      pass: process.env.ADMIN_PASS || '',
    },
    main: {
      user: process.env.SAP_USER || '',
      pass: process.env.SAP_PASS || '',
    },
  },

  comments: {
    adminAddMethod: 'Admin adds search method via auto test',
    adminAddField: 'Admin adds search field via auto test',
    adminSaveResult: 'Admin saves search result settings',
    mainSearch: 'Main user searches via auto-configured method',
  },

  timeouts: {
    e2eTest: 180000,
    phaseTimeout: 60000,
    statusWait: 30000,
    navigation: 15000,
  },
};

export function getTestData(tcKey: string) {
  const data = suiteDataRaw.testData[tcKey];
  if (!data) throw new Error(`Test data not found for key: ${tcKey}`);
  return data;
}

export function getMethodId(prefix = 'SRCH'): string {
  const ts = generateMMTimestamp().replace(/_/g, '');
  return `${prefix.replace(/_/g, '')}${ts}`;
}
