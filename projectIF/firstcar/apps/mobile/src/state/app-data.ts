/** Persisted app data shape + a hand-written validator (no schema library). */
import type { BuyerProfile, CarSpec, PurchaseCase } from '@firstcar/core';

export interface AppData {
  schema: 1;
  welcomed: boolean;
  profile?: BuyerProfile;
  readinessCar?: CarSpec;
  cases: PurchaseCase[];
  llmMock: boolean;
  remindersOn: boolean;
}

export const EMPTY_APP_DATA: AppData = { schema: 1, welcomed: false, cases: [], llmMock: true, remindersOn: false };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const optionalObject = (v: unknown) => v === undefined || isObject(v);
const optionalBoolean = (v: unknown) => v === undefined || typeof v === 'boolean';

function isCase(v: unknown): boolean {
  if (!isObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.status === 'string' &&
    isObject(v.listing) &&
    Array.isArray(v.claims) &&
    Array.isArray(v.items) &&
    Array.isArray(v.evidence) &&
    Array.isArray(v.clauses)
  );
}

/** Returns undefined when the JSON is unreadable or does not match the expected shape. */
export function parseAppData(json: string): AppData | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!isObject(parsed) || parsed.schema !== 1) return undefined;
  if (!Array.isArray(parsed.cases) || !parsed.cases.every(isCase)) return undefined;
  if (!optionalBoolean(parsed.welcomed) || !optionalBoolean(parsed.llmMock) || !optionalBoolean(parsed.remindersOn)) return undefined;
  if (!optionalObject(parsed.profile) || !optionalObject(parsed.readinessCar)) return undefined;
  return { ...EMPTY_APP_DATA, ...(parsed as unknown as Partial<AppData>) };
}
