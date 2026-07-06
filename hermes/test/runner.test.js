import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractLearnings, writeLearningsProposal, buildClaudeArgs, MEMORY_DIRS } from '../runner.js';

test('extractLearnings pulls the LEARNINGS line and cleans the summary', () => {
  const text = 'The answer is 42.\nLEARNINGS: ["User prefers concise answers", "Report format: bullets"]';
  const { learnings, summary } = extractLearnings(text);
  assert.deepEqual(learnings, ['User prefers concise answers', 'Report format: bullets']);
  assert.equal(summary, 'The answer is 42.');
});

test('extractLearnings handles absence, malformed JSON, and non-arrays', () => {
  assert.deepEqual(extractLearnings('plain output').learnings, []);
  assert.deepEqual(extractLearnings('x\nLEARNINGS: [not json').learnings, []);
  assert.deepEqual(extractLearnings('x\nLEARNINGS: ["ok" ]').learnings, ['ok']);
  assert.deepEqual(extractLearnings(null).learnings, []);
});

test('extractLearnings caps count and length', () => {
  const long = 'y'.repeat(500);
  const text = `done\nLEARNINGS: ["a","b","c","d","${long}"]`;
  const { learnings } = extractLearnings(text);
  assert.equal(learnings.length, 3);
  assert.ok(learnings.every((l) => l.length <= 300));
});

test('writeLearningsProposal drops a pending-review file in shared/inbox', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hermes-mem-'));
  try {
    writeLearningsProposal(root, 'learning', 'task-abc123', ['Fact one', 'Fact two']);
    const file = path.join(root, 'shared', 'inbox', 'task-abc123.md');
    assert.ok(existsSync(file));
    const body = readFileSync(file, 'utf8');
    assert.match(body, /agent: learning-room/);
    assert.match(body, /status: pending-review/);
    assert.match(body, /- Fact one/);
    assert.match(body, /- Fact two/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writeLearningsProposal is a no-op for empty learnings', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hermes-mem-'));
  try {
    writeLearningsProposal(root, 'learning', 'task-empty', []);
    assert.ok(!existsSync(path.join(root, 'shared', 'inbox', 'task-empty.md')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildClaudeArgs passes the agent tool allowlist', () => {
  const args = buildClaudeArgs('do it', { tools: ['Read', 'WebSearch'] });
  const i = args.indexOf('--allowedTools');
  assert.ok(i > -1);
  assert.equal(args[i + 1], 'Read,WebSearch');
});

test('buildClaudeArgs omits --allowedTools when the agent grants no tools', () => {
  assert.ok(!buildClaudeArgs('do it', { tools: [] }).includes('--allowedTools'));
  assert.ok(!buildClaudeArgs('do it', {}).includes('--allowedTools'));
});

test('every registry agent id has a memory dir mapping', () => {
  const registry = JSON.parse(readFileSync(new URL('../agents.json', import.meta.url), 'utf8'));
  for (const agent of registry.agents) {
    assert.ok(MEMORY_DIRS[agent.id], `missing MEMORY_DIRS entry for ${agent.id}`);
    assert.ok(Array.isArray(agent.tools), `tools must be an array for ${agent.id}`);
  }
});
