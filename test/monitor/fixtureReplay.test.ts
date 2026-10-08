// Replays the synthetic fixture files in test/fixtures/transcripts/ through a TranscriptSource,
// both as a file present at startup and as lines appended one by one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { SESSION_A } from '../support/monitorFakes';
import { repoPath } from '../support/repo';
import { sessionFile, sourceRig } from '../support/monitorRig';

const fixture = (name: string): string =>
  readFileSync(repoPath(`test/fixtures/transcripts/${name}`), 'utf8');

void describe('fixture replay', () => {
  void it('basic-session.jsonl present at startup: spawned, then idle because the last line ends the turn', async () => {
    const rig = sourceRig({ debounceMs: 100 });
    rig.fs.addFile(sessionFile(SESSION_A), fixture('basic-session.jsonl'));
    rig.source.start();
    await rig.time.advance(3000);
    assert.deepEqual(
      rig.events.map((e) => [e.state, e.toolName]),
      [
        ['spawned', 'Edit'],
        ['idle', 'Edit'],
      ],
    );
  });

  void it('basic-session.jsonl appended line by line follows the conversation', async () => {
    const rig = sourceRig({ debounceMs: 0 });
    rig.fs.addFile(sessionFile(SESSION_A), '');
    rig.source.start();
    await rig.time.advance(1500);
    const lines = fixture('basic-session.jsonl')
      .split('\n')
      .filter((l) => l.length > 0);
    for (const line of lines) {
      rig.fs.append(sessionFile(SESSION_A), line + '\n');
      await rig.time.advance(1100);
    }
    await rig.time.advance(2000);
    const tools = rig.events.map((e) => e.toolName).filter((t, i, all) => t !== all[i - 1]);
    assert.deepEqual(tools, [null, 'Read', 'Edit']);
    assert.equal(rig.registry.snapshot()[0]?.state, 'idle');
  });

  void it('edge-cases.jsonl never breaks the source; the mcp__ tool name and the valid prompt are seen', async () => {
    const rig = sourceRig({ debounceMs: 0 });
    rig.fs.addFile(sessionFile(SESSION_A), '');
    rig.source.start();
    await rig.time.advance(1500);
    rig.fs.append(sessionFile(SESSION_A), fixture('edge-cases.jsonl'));
    await rig.time.advance(3000);
    const agent = rig.registry.snapshot()[0];
    assert.equal(agent?.toolName, 'mcp__files__read');
    assert.equal(agent?.state, 'working');
    assert.deepEqual(rig.logger.messages('error'), []);
  });
});
