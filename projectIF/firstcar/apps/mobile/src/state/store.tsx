/**
 * App data store: profile, readiness car, purchase cases. Immutable updates only; every case
 * change goes through core's applyEvent. Persisted to the encrypted vault on change.
 */
import { applyEvent, type CaseEvent, type PurchaseCase } from '@firstcar/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { EMPTY_APP_DATA, parseAppData, type AppData } from '@/state/app-data';
import { useSession } from '@/state/session';
import { saveVault } from '@/vault/vault';

export type { AppData };

interface StoreState {
  data: AppData;
  saveError?: string;
}

interface StoreActions {
  patch(p: Partial<Omit<AppData, 'cases' | 'schema'>>): void;
  addCase(c: PurchaseCase): void;
  deleteCase(id: string): void;
  /** Applies an event to a case. Returns an error code, or undefined on success. */
  caseEvent(id: string, event: CaseEvent): string | undefined;
  getCase(id: string): PurchaseCase | undefined;
}

type Store = StoreState & StoreActions;

// Split so components that only dispatch (useStoreActions) do not re-render on every data change.
const StateContext = createContext<StoreState | null>(null);
const ActionsContext = createContext<StoreActions | null>(null);

export function useStoreState(): StoreState {
  const s = useContext(StateContext);
  if (!s) throw new Error('useStoreState outside StoreProvider');
  return s;
}

export function useStoreActions(): StoreActions {
  const a = useContext(ActionsContext);
  if (!a) throw new Error('useStoreActions outside StoreProvider');
  return a;
}

/** State and actions together. */
export function useStore(): Store {
  const state = useStoreState();
  const actions = useStoreActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { initialJson, prefs } = useSession();
  // The session only opens the app with a validated vault; the fallback is for an empty one.
  const [data, setData] = useState<AppData>(() => (initialJson ? parseAppData(initialJson) : undefined) ?? EMPTY_APP_DATA);
  const [saveError, setSaveError] = useState<string | undefined>();
  // Latest committed data, so several events in one handler see each other's results.
  // Written only in event handlers (commit), never during render.
  const latest = useRef<AppData>(data);
  const firstRender = useRef(true);

  // Saves run immediately (no debounce: a killed app must not lose the last action); saveVault keeps them ordered.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    saveVault(JSON.stringify(data)).then(
      () => setSaveError(undefined),
      (e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)),
    );
  }, [data]);

  const commit = useCallback((next: AppData) => {
    latest.current = next;
    setData(next);
  }, []);

  const patch = useCallback<StoreActions['patch']>((p) => commit({ ...latest.current, ...p }), [commit]);
  const addCase = useCallback((c: PurchaseCase) => commit({ ...latest.current, cases: [c, ...latest.current.cases] }), [commit]);
  const deleteCase = useCallback((id: string) => commit({ ...latest.current, cases: latest.current.cases.filter((c) => c.id !== id) }), [commit]);
  const getCase = useCallback((id: string) => latest.current.cases.find((c) => c.id === id), []);

  const caseEvent = useCallback<StoreActions['caseEvent']>(
    (id, event) => {
      const base = latest.current;
      const existing = base.cases.find((c) => c.id === id);
      if (!existing) return 'unknown_case';
      const result = applyEvent(existing, event, { now: new Date(), locale: prefs.locale });
      if (!result.ok) return result.error;
      commit({ ...base, cases: base.cases.map((c) => (c.id === id ? result.next : c)) });
      return undefined;
    },
    [commit, prefs.locale],
  );

  const state = useMemo<StoreState>(() => ({ data, saveError }), [data, saveError]);
  const actions = useMemo<StoreActions>(() => ({ patch, addCase, deleteCase, caseEvent, getCase }), [patch, addCase, deleteCase, caseEvent, getCase]);
  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  );
}

/** The case for a route param, kept fresh from the store. */
export function useCase(id: string | undefined): PurchaseCase | undefined {
  const { data } = useStoreState();
  return id ? data.cases.find((c) => c.id === id) : undefined;
}
