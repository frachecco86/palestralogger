import { useMemo, useSyncExternalStore } from 'react'
import { getVersion, subscribe } from '../db/db'

/** Riesegue la query quando il DB cambia (mutazioni notificate). */
export function useLiveData<T>(factory: () => T, deps: unknown[] = []): T {
  const version = useSyncExternalStore(subscribe, getVersion)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, [...deps, version])
}

export type ToastKind = 'ok' | 'err'

type ToastListener = (message: string, kind: ToastKind) => void
const listeners = new Set<ToastListener>()

export function toast(message: string, kind: ToastKind = 'ok'): void {
  listeners.forEach((l) => l(message, kind))
}

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
