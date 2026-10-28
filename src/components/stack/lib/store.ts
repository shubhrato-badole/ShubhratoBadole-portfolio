'use client';
import { useSyncExternalStore } from 'react';
import type { Category } from '@/components/stack/data';

export interface UIState {
  filter: Category | null;
  hovered: number;      // index in the *visible* list, -1 when none
  active: number;       // index in the visible list of the card at the front
  count: number;        // visible card count
  accent: string;       // css colour of the current scene accent
  introPlayed: boolean;
  scrubbing: boolean;
  menuOpen: boolean;
}
let state: UIState = { filter: null, hovered: -1, active: 0, count: 19, accent: '#6126ff', introPlayed: false, scrubbing: false, menuOpen: false };
const subs = new Set<() => void>();
export const getState = () => state;
export const setState = (p: Partial<UIState>) => {
  let changed = false;
  for (const k in p) if ((state as any)[k] !== (p as any)[k]) { changed = true; break; }
  if (!changed) return;
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function useStore<T>(sel: (s: UIState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}
