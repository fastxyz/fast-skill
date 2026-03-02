import type { DemoState } from './types';

const g = globalThis as typeof globalThis & { __moneyDemoState?: DemoState };

function createState(): DemoState {
  return {
    sessions: new Map(),
    receiverAccounts: new Map(),
    intents: new Map(),
    events: new Map(),
    verifierTimer: null,
    verifierActive: false,
  };
}

export function getDemoState(): DemoState {
  if (!g.__moneyDemoState) {
    g.__moneyDemoState = createState();
  }
  return g.__moneyDemoState;
}

