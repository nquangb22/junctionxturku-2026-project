/**
 * App data store: profile, readiness car, purchase cases. Immutable updates only; every case
 * change goes through core's applyEvent. Persisted to the encrypted vault on change.
 */
import { applyEvent, type BuyerProfile, type CarSpec, type CaseEvent, type PurchaseCase } from '@firstcar/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useSession } from '@/state/session';
import { saveVault } from '@/vault/vault';

export interface AppData {
  schema: 1;
  welcomed: boolean;
  profile?: BuyerProfile;
  readinessCar?: CarSpec;
  cases: PurchaseCase[];
  llmMock: boolean;
  remindersOn: boolean;
}

const EMPTY: AppData = { schema: 1, welcomed: false, cases: [], llmMock: true, remindersOn: false };

interface Store {
  data: AppData;
  saveError?: string;
  patch(p: Partial<Omit<AppData, 'cases' | 'schema'>>): void;
  addCase(c: PurchaseCase): void;
  deleteCase(id: string): void;
  /** Applies an event to a case. Returns an error code, or undefined on success. */
  caseEvent(id: string, event: CaseEvent): string | undefined;
  getCase(id: string): PurchaseCase | undefined;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

function parse(json: string | undefined): AppData {
  if (!json) return EMPTY;
  try {
    const parsed = JSON.parse(json) as Partial<AppData>;
    return parsed.schema === 1 ? { ...EMPTY, ...parsed } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { initialJson, prefs } = useSession();
  const [data, setData] = useState<AppData>(() => parse(initialJson));
  const [saveError, setSaveError] = useState<string | undefined>();
  // Latest committed data, so several events in one handler see each other's results.
  // Written only in event handlers (commit), never during render.
  const latest = useRef<AppData | null>(null);
  const firstRender = useRef(true);
  // Saves run immediately (no debounce: a killed app must not lose the last action) and in order.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const json = JSON.stringify(data);
    saveQueue.current = saveQueue.current
      .then(() => saveVault(json))
      .then(
        () => setSaveError(undefined),
        (e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)),
      );
  }, [data]);

  const current = useCallback(() => latest.current ?? data, [data]);
  const commit = useCallback((next: AppData) => {
    latest.current = next;
    setData(next);
  }, []);

  const patch = useCallback<Store['patch']>((p) => commit({ ...current(), ...p }), [commit, current]);
  const addCase = useCallback((c: PurchaseCase) => commit({ ...current(), cases: [c, ...current().cases] }), [commit, current]);
  const deleteCase = useCallback((id: string) => commit({ ...current(), cases: current().cases.filter((c) => c.id !== id) }), [commit, current]);
  const getCase = useCallback((id: string) => current().cases.find((c) => c.id === id), [current]);

  const caseEvent = useCallback<Store['caseEvent']>(
    (id, event) => {
      const base = current();
      const existing = base.cases.find((c) => c.id === id);
      if (!existing) return 'unknown_case';
      const result = applyEvent(existing, event, { now: new Date(), locale: prefs.locale });
      if (!result.ok) return result.error;
      commit({ ...base, cases: base.cases.map((c) => (c.id === id ? result.next : c)) });
      return undefined;
    },
    [commit, current, prefs.locale],
  );

  const store = useMemo<Store>(() => ({ data, saveError, patch, addCase, deleteCase, caseEvent, getCase }), [data, saveError, patch, addCase, deleteCase, caseEvent, getCase]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** The case for a route param, kept fresh from the store. */
export function useCase(id: string | undefined): PurchaseCase | undefined {
  const { data } = useStore();
  return id ? data.cases.find((c) => c.id === id) : undefined;
}
