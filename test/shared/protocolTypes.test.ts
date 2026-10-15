// Type-level proofs for the protocol (M2 plan test note 1 and note 6). This file is type-checked
// by tsconfig.tools.json (`npm run typecheck`): if a union gains a member without its switch, its
// type list, or its proof being updated, typecheck fails here. The runtime assertions only make
// sure every switch is reachable.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertNever } from '../../src/shared/assertNever';
import {
  AGENT_STATES,
  HOST_TO_WEBVIEW_TYPES,
  WEBVIEW_TO_HOST_TYPES,
} from '../../src/shared/protocol';
import type { Progress } from '../../src/shared/progress';
import type {
  AgentInfo,
  AgentInfoKeysComplete,
  AgentState,
  ConfigSnapshot,
  FocusAgentMessage,
  HostToWebviewMessage,
  HostTypesComplete,
  ProgressMessage,
  ReadyMessage,
  SaveProgressMessage,
  WebviewToHostMessage,
  WebviewTypesComplete,
} from '../../src/shared/protocol';

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// The protocol's own proofs must hold (each is `true` only if its Exact check passes).
const proofs: [HostTypesComplete, WebviewTypesComplete, AgentInfoKeysComplete] = [true, true, true];

// Independent restatements of the plan, so a change in protocol.ts that also edits the proofs
// still fails here.
const webviewTypesArePlanned: Exact<
  WebviewToHostMessage['type'],
  'ready' | 'focusAgent' | 'saveProgress'
> = true;
const hostTypesArePlanned: Exact<
  HostToWebviewMessage['type'],
  'config' | 'agentList' | 'agentState' | 'progress'
> = true;
const statesArePlanned: Exact<AgentState, 'spawned' | 'working' | 'idle' | 'despawned'> = true;
const agentKeysArePlanned: Exact<
  keyof AgentInfo,
  'id' | 'name' | 'state' | 'toolName' | 'timestamp'
> = true;
const readyHasOnlyType: Exact<keyof ReadyMessage, 'type'> = true;
const focusHasOnlyTypeAndId: Exact<keyof FocusAgentMessage, 'type' | 'agentId'> = true;
const configHasExactlyFourKeys: Exact<
  keyof ConfigSnapshot,
  'protocolVersion' | 'enemiesEnabled' | 'killsPerStage' | 'maxEnemies'
> = true;
const saveProgressHasOnlyTypeAndProgress: Exact<keyof SaveProgressMessage, 'type' | 'progress'> =
  true;
const progressMessageHasOnlyTypeAndProgress: Exact<keyof ProgressMessage, 'type' | 'progress'> =
  true;
// The progress value is numbers only: no string-typed field can carry agent or transcript data.
const progressIsNumbersOnly: Exact<
  { [K in keyof Progress]: Progress[K] extends number ? true : false }[keyof Progress],
  true
> = true;
// No optional properties: Required<T> is identical to T.
const agentInfoHasNoOptional: Exact<Required<AgentInfo>, AgentInfo> = true;
const focusHasNoOptional: Exact<Required<FocusAgentMessage>, FocusAgentMessage> = true;
const toolNameIsNullable: Exact<AgentInfo['toolName'], string | null> = true;

function describeHostType(type: HostToWebviewMessage['type']): string {
  switch (type) {
    case 'config':
      return 'config';
    case 'agentList':
      return 'agentList';
    case 'agentState':
      return 'agentState';
    case 'progress':
      return 'progress';
    default:
      return assertNever(type);
  }
}

function describeWebviewType(type: WebviewToHostMessage['type']): string {
  switch (type) {
    case 'ready':
      return 'ready';
    case 'focusAgent':
      return 'focusAgent';
    case 'saveProgress':
      return 'saveProgress';
    default:
      return assertNever(type);
  }
}

function describeState(state: AgentState): string {
  switch (state) {
    case 'spawned':
      return 'spawned';
    case 'working':
      return 'working';
    case 'idle':
      return 'idle';
    case 'despawned':
      return 'despawned';
    default:
      return assertNever(state);
  }
}

function describeWebviewMessage(message: WebviewToHostMessage): string {
  switch (message.type) {
    case 'ready':
      return 'ready';
    case 'focusAgent':
      return `focus ${message.agentId}`;
    case 'saveProgress':
      return `save ${message.progress.totalKills}`;
    default:
      return assertNever(message);
  }
}

// Messages that cannot be expressed. Each directive sits directly above the line that must be a
// type error, so formatting cannot move it.
// @ts-expect-error: no stop message exists in the webview-to-host union (invariant 3).
const stop: WebviewToHostMessage = { type: 'stopAgent', agentId: 'a' };
const focusWithCommand: WebviewToHostMessage = {
  type: 'focusAgent',
  agentId: 'a',
  // @ts-expect-error: focusAgent carries no command or input field (invariant 3).
  command: 'kill',
};
const agentWithHp: AgentInfo = {
  id: 'a',
  name: 'A',
  state: 'idle',
  toolName: null,
  timestamp: 0,
  // @ts-expect-error: AgentInfo has no health-like field (invariant 1).
  hp: 1,
};
const agentWithText: AgentInfo = {
  id: 'a',
  name: 'A',
  state: 'idle',
  toolName: null,
  timestamp: 0,
  // @ts-expect-error: AgentInfo has no transcript text field (invariant 7).
  text: 'x',
};
const saveWithAgent: WebviewToHostMessage = {
  type: 'saveProgress',
  progress: {
    schemaVersion: 1,
    stageIndex: 1,
    killsInStage: 0,
    totalKills: 0,
    bossesDefeated: 0,
    cycle: 0,
  },
  // @ts-expect-error: saveProgress names no agent, terminal, or command (invariant 3).
  agentId: 'a',
};
const progressWithText: Progress = {
  schemaVersion: 1,
  stageIndex: 1,
  killsInStage: 0,
  totalKills: 0,
  bossesDefeated: 0,
  cycle: 0,
  // @ts-expect-error: Progress has no string field, so no agent or transcript data can be stored.
  agentName: 'x',
};
// @ts-expect-error: toolName is never optional; absence is null.
const agentWithoutTool: AgentInfo = { id: 'a', name: 'A', state: 'idle', timestamp: 0 };
// @ts-expect-error: dead is not an agent state (invariant 1).
const deadState: AgentState = 'dead';

void describe('protocol types (compile-time proofs, note 1)', () => {
  void it('every proof and restatement holds', () => {
    assert.deepEqual(proofs, [true, true, true]);
    assert.ok(
      [
        webviewTypesArePlanned,
        hostTypesArePlanned,
        statesArePlanned,
        agentKeysArePlanned,
        readyHasOnlyType,
        focusHasOnlyTypeAndId,
        configHasExactlyFourKeys,
        saveProgressHasOnlyTypeAndProgress,
        progressMessageHasOnlyTypeAndProgress,
        progressIsNumbersOnly,
        agentInfoHasNoOptional,
        focusHasNoOptional,
        toolNameIsNullable,
      ].every((value) => value),
    );
  });

  void it('each exhaustive switch handles every runtime list entry', () => {
    assert.deepEqual(HOST_TO_WEBVIEW_TYPES.map(describeHostType), [...HOST_TO_WEBVIEW_TYPES]);
    assert.deepEqual(WEBVIEW_TO_HOST_TYPES.map(describeWebviewType), [...WEBVIEW_TO_HOST_TYPES]);
    assert.deepEqual(AGENT_STATES.map(describeState), [...AGENT_STATES]);
    assert.equal(describeWebviewMessage({ type: 'focusAgent', agentId: 'sim-1' }), 'focus sim-1');
    assert.equal(
      describeWebviewMessage({
        type: 'saveProgress',
        progress: {
          schemaVersion: 1,
          stageIndex: 1,
          killsInStage: 0,
          totalKills: 9,
          bossesDefeated: 0,
          cycle: 0,
        },
      }),
      'save 9',
    );
  });

  void it('an unexpected runtime variant reaches assertNever and throws', () => {
    assert.throws(() => describeState('dead' as AgentState), TypeError);
    assert.throws(
      () => describeWebviewType('stopAgent' as WebviewToHostMessage['type']),
      TypeError,
    );
  });

  void it('the inexpressible messages above are still only values at runtime (kept for typecheck)', () => {
    // Referencing them keeps noUnusedLocals satisfied; their value is the @ts-expect-error.
    assert.equal(
      [
        stop,
        focusWithCommand,
        saveWithAgent,
        progressWithText,
        agentWithHp,
        agentWithText,
        agentWithoutTool,
        deadState,
      ].length,
      8,
    );
  });
});
