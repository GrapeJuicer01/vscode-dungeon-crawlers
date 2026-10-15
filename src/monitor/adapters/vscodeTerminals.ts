// vscode implementation of the terminal port (agent-detection.md section 3.2).
//
// Core invariant 3: reads window.terminals, window.activeTerminal, the open and close events,
// and Terminal.exitStatus, and calls only Terminal.show(). It never creates, closes, hides, or
// sends input to a terminal. Its own event subscriptions live in `subscriptions` and are the
// only things it disposes. Type-only vscode import: window is passed in by extension.ts.
import type * as vscode from 'vscode';
import type { MonitorDisposable, TerminalPort, TerminalRef } from '../ports';

export type TerminalWindow = Pick<
  typeof vscode.window,
  'terminals' | 'activeTerminal' | 'onDidOpenTerminal' | 'onDidCloseTerminal'
>;

type Listener = (ref: TerminalRef) => void;

function fanOut(listeners: ReadonlySet<Listener>, ref: TerminalRef): void {
  for (const listener of [...listeners]) {
    try {
      listener(ref);
    } catch {
      // A port listener failure never reaches VS Code's event loop (Core invariant 4).
    }
  }
}

function addListener(listeners: Set<Listener>, listener: Listener): MonitorDisposable {
  const entry: Listener = (ref) => listener(ref);
  listeners.add(entry);
  return { dispose: () => listeners.delete(entry) };
}

export function createVscodeTerminalPort(window: TerminalWindow): TerminalPort {
  const byKey = new Map<number, vscode.Terminal>();
  const keys = new WeakMap<vscode.Terminal, number>();
  const openListeners = new Set<Listener>();
  const closeListeners = new Set<Listener>();
  const subscriptions: vscode.Disposable[] = [];
  let nextKey = 1;
  let disposed = false;

  const keyOf = (instance: vscode.Terminal): number => {
    const known = keys.get(instance);
    if (known !== undefined) {
      return known;
    }
    const key = nextKey;
    nextKey += 1;
    keys.set(instance, key);
    byKey.set(key, instance);
    return key;
  };

  for (const instance of window.terminals) {
    keyOf(instance);
  }
  subscriptions.push(
    window.onDidOpenTerminal((opened) => {
      if (!disposed) {
        fanOut(openListeners, { key: keyOf(opened) });
      }
    }),
    window.onDidCloseTerminal((closed) => {
      const key = keys.get(closed);
      if (disposed || key === undefined) {
        return;
      }
      byKey.delete(key);
      keys.delete(closed);
      fanOut(closeListeners, { key });
    }),
  );

  return {
    activeTerminal(): TerminalRef | null {
      if (disposed) {
        return null;
      }
      const active = window.activeTerminal;
      return active === undefined ? null : { key: keyOf(active) };
    },
    onDidOpenTerminal(listener: Listener): MonitorDisposable {
      return addListener(openListeners, listener);
    },
    onDidCloseTerminal(listener: Listener): MonitorDisposable {
      return addListener(closeListeners, listener);
    },
    show(ref: TerminalRef): boolean {
      try {
        const target = byKey.get(ref.key);
        if (disposed || target === undefined || target.exitStatus !== undefined) {
          return false;
        }
        target.show();
        return true;
      } catch {
        return false;
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const subscription of subscriptions.splice(0)) {
        subscription.dispose();
      }
      openListeners.clear();
      closeListeners.clear();
      byKey.clear();
    },
  };
}
