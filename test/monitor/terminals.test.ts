// TerminalSource linking and reveal, and the vscode terminal adapter (M3 plan test note 8).
// Terminals are reveal-only: the strict fake terminal fails any use of another member.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type * as vscode from 'vscode';
import { createVscodeTerminalPort } from '../../src/monitor/adapters/vscodeTerminals';
import type { TerminalWindow } from '../../src/monitor/adapters/vscodeTerminals';
import { LINK_WINDOW_MS, TerminalSource } from '../../src/monitor/TerminalSource';
import { FakeEvent, FakeTerminal } from '../support/fakeVscode';
import {
  FakeTerminalPort,
  FakeTime,
  RecordingLogger,
  SESSION_A,
  SESSION_B,
} from '../support/monitorFakes';

function make(): {
  time: FakeTime;
  port: FakeTerminalPort;
  logger: RecordingLogger;
  source: TerminalSource;
} {
  const time = new FakeTime();
  const port = new FakeTerminalPort();
  const logger = new RecordingLogger();
  return { time, port, logger, source: new TerminalSource(port, time, logger) };
}

void describe('TerminalSource linking', () => {
  void it('links a new session to the active terminal; reveal shows it exactly once', () => {
    const { port, source } = make();
    port.openTerminal(1, true);
    source.linkNewSession(SESSION_A);
    source.reveal(SESSION_A);
    assert.deepEqual(port.shows, [1]);
  });

  void it('with no active terminal, links to the most recent unlinked terminal opened within 30 s', async () => {
    const { time, port, source } = make();
    port.openTerminal(1);
    await time.advance(5000);
    port.openTerminal(2);
    await time.advance(1000);
    source.linkNewSession(SESSION_A);
    source.reveal(SESSION_A);
    assert.deepEqual(port.shows, [2]);
  });

  void it('a terminal opened more than 30 s ago is not linked', async () => {
    const { time, port, source, logger } = make();
    port.openTerminal(1);
    await time.advance(LINK_WINDOW_MS + 1000);
    source.linkNewSession(SESSION_A);
    source.reveal(SESSION_A);
    assert.deepEqual(port.shows, []);
    assert.ok(logger.messages('trace').some((m) => m.includes('reveal skipped')));
  });

  void it('startup-style ids and simulated agents never link', () => {
    const { port, source } = make();
    port.openTerminal(1, true);
    source.linkNewSession('sim-0-0');
    source.reveal('sim-0-0');
    assert.deepEqual(port.shows, []);
  });

  void it('one terminal never links two live agents', () => {
    const { port, source } = make();
    port.openTerminal(1, true);
    source.linkNewSession(SESSION_A);
    source.linkNewSession(SESSION_B);
    source.reveal(SESSION_A);
    source.reveal(SESSION_B);
    assert.deepEqual(port.shows, [1], 'only A was linked');
  });

  void it('dropLink on despawn frees the terminal for the next session', () => {
    const { port, source } = make();
    port.openTerminal(1, true);
    source.linkNewSession(SESSION_A);
    source.dropLink(SESSION_A);
    source.reveal(SESSION_A);
    assert.deepEqual(port.shows, []);
    source.linkNewSession(SESSION_B);
    source.reveal(SESSION_B);
    assert.deepEqual(port.shows, [1]);
  });

  void it('closing the terminal removes the link and does not throw or reveal', () => {
    const { port, source } = make();
    port.openTerminal(1, true);
    source.linkNewSession(SESSION_A);
    port.closeTerminal(1);
    source.reveal(SESSION_A);
    assert.deepEqual(port.shows, []);
  });

  void it('reveal of an unknown agent shows nothing and traces once per skip', () => {
    const { port, source, logger } = make();
    port.openTerminal(1, true);
    source.reveal('nobody');
    source.reveal('nobody');
    assert.deepEqual(port.shows, []);
    assert.equal(logger.messages('trace').filter((m) => m.includes('reveal skipped')).length, 2);
  });

  void it('a throwing port.show does not escape reveal', () => {
    const { port, source, logger } = make();
    port.openTerminal(1, true);
    source.linkNewSession(SESSION_A);
    port.showThrows = true;
    assert.doesNotThrow(() => source.reveal(SESSION_A));
    assert.ok(logger.messages('error').length >= 1);
  });

  void it('a null port makes every call a harmless no-op', () => {
    const source = new TerminalSource(null, new FakeTime(), new RecordingLogger());
    assert.doesNotThrow(() => {
      source.linkNewSession(SESSION_A);
      source.reveal(SESSION_A);
      source.dropLink(SESSION_A);
      source.dispose();
    });
  });

  void it('dispose removes its own port listeners, never disposes the port, and reveal then does nothing', () => {
    const { port, source } = make();
    port.openTerminal(1, true);
    source.linkNewSession(SESSION_A);
    assert.equal(port.listenerCount, 2);
    source.dispose();
    assert.equal(port.listenerCount, 0);
    assert.equal(port.disposed, false);
    source.reveal(SESSION_A);
    assert.deepEqual(port.shows, []);
    assert.doesNotThrow(() => source.dispose());
  });

  void it('terminal events never emit or change anything observable beyond links', () => {
    const { port, source } = make();
    port.openTerminal(1, true);
    source.linkNewSession(SESSION_A);
    port.openTerminal(2);
    port.closeTerminal(2);
    source.reveal(SESSION_A);
    assert.deepEqual(port.shows, [1]);
  });
});

// ---------------------------------------------------------------------------------------------
// vscode adapter

interface StrictWindow extends TerminalWindow {
  readonly opened: FakeEvent<vscode.Terminal>;
  readonly closed: FakeEvent<vscode.Terminal>;
  active: vscode.Terminal | undefined;
}

function strictWindow(terminals: readonly FakeTerminal[]): StrictWindow {
  const opened = new FakeEvent<vscode.Terminal>();
  const closed = new FakeEvent<vscode.Terminal>();
  const win = {
    opened,
    closed,
    active: undefined as vscode.Terminal | undefined,
    get terminals(): readonly vscode.Terminal[] {
      return terminals as unknown as readonly vscode.Terminal[];
    },
    get activeTerminal(): vscode.Terminal | undefined {
      return win.active;
    },
    onDidOpenTerminal: (listener: (t: vscode.Terminal) => unknown) => opened.subscribe(listener),
    onDidCloseTerminal: (listener: (t: vscode.Terminal) => unknown) => closed.subscribe(listener),
  };
  return win;
}

const asTerminal = (t: FakeTerminal): vscode.Terminal => t as unknown as vscode.Terminal;

void describe('createVscodeTerminalPort', () => {
  void it('show(ref) calls terminal.show() once and touches nothing else', () => {
    const t = new FakeTerminal();
    const win = strictWindow([t]);
    win.active = asTerminal(t);
    const port = createVscodeTerminalPort(win);
    const ref = port.activeTerminal();
    assert.ok(ref !== null);
    assert.equal(port.show(ref), true);
    assert.equal(t.shows, 1);
    assert.deepEqual(t.forbiddenUse, []);
  });

  void it('keys are stable for the same terminal and distinct between terminals', () => {
    const a = new FakeTerminal();
    const b = new FakeTerminal();
    const win = strictWindow([a, b]);
    const port = createVscodeTerminalPort(win);
    win.active = asTerminal(a);
    const first = port.activeTerminal();
    const again = port.activeTerminal();
    win.active = asTerminal(b);
    const other = port.activeTerminal();
    assert.deepEqual(first, again);
    assert.notDeepEqual(first, other);
  });

  void it('closed or exited terminals return false and are not shown', () => {
    const a = new FakeTerminal();
    const win = strictWindow([a]);
    const port = createVscodeTerminalPort(win);
    win.active = asTerminal(a);
    const ref = port.activeTerminal();
    assert.ok(ref !== null);
    a.exitStatus = { code: 0 };
    assert.equal(port.show(ref), false);
    a.exitStatus = undefined;
    win.closed.fire(asTerminal(a));
    assert.equal(port.show(ref), false);
    assert.equal(a.shows, 0);
    assert.deepEqual(a.forbiddenUse, []);
  });

  void it('an unknown ref returns false', () => {
    const port = createVscodeTerminalPort(strictWindow([]));
    assert.equal(port.show({ key: 999 }), false);
  });

  void it('open and close events reach port listeners; a throwing listener does not break the event', () => {
    const win = strictWindow([]);
    const port = createVscodeTerminalPort(win);
    const seen: string[] = [];
    port.onDidOpenTerminal(() => {
      throw new Error('listener');
    });
    port.onDidOpenTerminal((ref) => seen.push(`open${ref.key}`));
    port.onDidCloseTerminal((ref) => seen.push(`close${ref.key}`));
    const t = new FakeTerminal();
    assert.doesNotThrow(() => win.opened.fire(asTerminal(t)));
    win.closed.fire(asTerminal(t));
    assert.deepEqual(seen, ['open1', 'close1']);
  });

  void it('disposing the port removes its subscriptions and calls no terminal method', () => {
    const t = new FakeTerminal();
    const win = strictWindow([t]);
    const port = createVscodeTerminalPort(win);
    assert.equal(win.opened.listenerCount, 1);
    assert.equal(win.closed.listenerCount, 1);
    port.dispose();
    assert.equal(win.opened.listenerCount, 0);
    assert.equal(win.closed.listenerCount, 0);
    assert.deepEqual(t.forbiddenUse, []);
    assert.equal(t.shows, 0);
    assert.equal(port.activeTerminal(), null);
    assert.equal(port.show({ key: 1 }), false);
    assert.doesNotThrow(() => port.dispose());
  });

  void it('show() that throws inside VS Code is contained and reported as false', () => {
    const t = new FakeTerminal();
    t.show = () => {
      throw new Error('boom');
    };
    const win = strictWindow([t]);
    win.active = asTerminal(t);
    const port = createVscodeTerminalPort(win);
    const ref = port.activeTerminal();
    assert.ok(ref !== null);
    assert.equal(port.show(ref), false);
  });
});
