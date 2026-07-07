// Memory-inbox review API tests (plain node:test).
// Boots the real server.js with a temp HERMES_MEMORY_DIR, seeds proposal
// files into <memory>/shared/inbox/, and exercises GET /memory/inbox,
// POST /memory/accept, POST /memory/discard.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, '..', 'server.js');

const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(path.join(os.tmpdir(), 'hermes-memory-test-'));
const DATA_DIR = path.join(TMP, 'data');
const MEMORY_DIR = path.join(TMP, 'memory');
const INBOX = path.join(MEMORY_DIR, 'shared', 'inbox');

const ENV = {
  ...process.env,
  HERMES_PORT: String(PORT),
  HERMES_DATA_DIR: DATA_DIR,
  HERMES_MEMORY_DIR: MEMORY_DIR,
  HERMES_RUNNER: 'mock',
  HERMES_DEMO: '0',
};

let child = null;

function seedProposal(taskId, agentDir, learnings) {
  mkdirSync(INBOX, { recursive: true });
  const body = [
    '---',
    `task: ${taskId}`,
    `agent: ${agentDir}`,
    `proposed: 2026-07-07T10:00:00.000Z`,
    'status: pending-review',
    '---',
    '',
    ...learnings.map((l) => `- ${l}`),
    '',
  ].join('\n');
  writeFileSync(path.join(INBOX, `${taskId}.md`), body);
}

async function getJson(pathname) {
  const res = await fetch(BASE + pathname);
  return { status: res.status, body: await res.json(), headers: res.headers };
}

async function post(pathname, body, headers = {}) {
  const res = await fetch(BASE + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

async function waitFor(fn, what, timeoutMs = 8000, everyMs = 60) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await fn()) return;
    } catch {
      // not up yet — keep polling
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

before(async () => {
  // Seed inbox noise the API must skip: .gitkeep, a subdir, malformed files.
  mkdirSync(path.join(INBOX, 'discarded'), { recursive: true });
  writeFileSync(path.join(INBOX, '.gitkeep'), '');
  writeFileSync(path.join(INBOX, 'garbage.md'), 'not a proposal at all\n');
  writeFileSync(path.join(INBOX, 'nobullets.md'), '---\ntask: task-x\nagent: code-lab\n---\n');

  seedProposal('task-aaaa1111', 'learning-room', ['WS reconnects need jittered backoff', 'Pin mock delays in tests']);
  seedProposal('task-bbbb2222', 'code-lab', ['Lockfile conflicts mean stale checkout']);
  seedProposal('task-cccc3333', 'not-a-real-dir', ['Should be rejected on accept']);

  child = spawn(process.execPath, [SERVER], { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => process.stderr.write(`[daemon] ${d}`));
  await waitFor(async () => (await getJson('/health')).body.ok === true, 'daemon /health');
});

after(async () => {
  await new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 3000).unref();
  });
  rmSync(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

test('GET /memory/inbox lists seeded proposals, skipping .gitkeep/subdirs/malformed files', async () => {
  const { status, body } = await getJson('/memory/inbox');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.proposals));
  const ids = body.proposals.map((p) => p.taskId).sort();
  assert.deepEqual(ids, ['task-aaaa1111', 'task-bbbb2222', 'task-cccc3333']);

  const learning = body.proposals.find((p) => p.taskId === 'task-aaaa1111');
  assert.deepEqual(Object.keys(learning).sort(), ['agent', 'learnings', 'proposed', 'taskId']);
  assert.equal(learning.agent, 'learning-room');
  assert.equal(learning.proposed, '2026-07-07T10:00:00.000Z');
  assert.deepEqual(learning.learnings, ['WS reconnects need jittered backoff', 'Pin mock delays in tests']);
});

test('POST /memory/accept promotes learnings to longterm.md with provenance and removes the inbox file', async () => {
  const { status, body } = await post('/memory/accept', { taskId: 'task-aaaa1111' });
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true, promoted: 2 });

  const longterm = path.join(MEMORY_DIR, 'agents', 'learning-room', 'longterm.md');
  assert.ok(existsSync(longterm), 'longterm.md created');
  const text = readFileSync(longterm, 'utf8');
  assert.ok(text.startsWith('# Learning Room — Long-term Memory\n'), 'heading written for new file');
  const date = new Date().toISOString().slice(0, 10);
  assert.ok(
    text.includes(`- [${date} | promoted from task task-aaaa1111 | confidence: medium] WS reconnects need jittered backoff`),
    'first learning with provenance',
  );
  assert.ok(
    text.includes(`- [${date} | promoted from task task-aaaa1111 | confidence: medium] Pin mock delays in tests`),
    'second learning with provenance',
  );

  assert.ok(!existsSync(path.join(INBOX, 'task-aaaa1111.md')), 'inbox file removed');
  const inbox = await getJson('/memory/inbox');
  assert.ok(!inbox.body.proposals.some((p) => p.taskId === 'task-aaaa1111'), 'no longer listed');

  // Second accept of the same taskId → 404.
  const again = await post('/memory/accept', { taskId: 'task-aaaa1111' });
  assert.equal(again.status, 404);
});

test('POST /memory/accept appends to an existing longterm.md without clobbering it', async () => {
  const dir = path.join(MEMORY_DIR, 'agents', 'code-lab');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'longterm.md'), '# Code Lab — Long-term Memory\n\n- existing note\n');

  const { status, body } = await post('/memory/accept', { taskId: 'task-bbbb2222' });
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true, promoted: 1 });

  const text = readFileSync(path.join(dir, 'longterm.md'), 'utf8');
  assert.ok(text.includes('- existing note'), 'existing content preserved');
  const date = new Date().toISOString().slice(0, 10);
  assert.ok(text.includes(`- [${date} | promoted from task task-bbbb2222 | confidence: medium] Lockfile conflicts mean stale checkout`));
});

test('POST /memory/accept rejects an unknown agent memory dir with 400 (path traversal defense)', async () => {
  const { status, body } = await post('/memory/accept', { taskId: 'task-cccc3333' });
  assert.equal(status, 400);
  assert.match(body.error, /unknown agent memory dir/);
  assert.ok(existsSync(path.join(INBOX, 'task-cccc3333.md')), 'file left in place');
});

test('POST /memory/discard moves the file into discarded/ and 404s when missing', async () => {
  const { status, body } = await post('/memory/discard', { taskId: 'task-cccc3333' });
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
  assert.ok(!existsSync(path.join(INBOX, 'task-cccc3333.md')), 'removed from inbox');
  assert.ok(existsSync(path.join(INBOX, 'discarded', 'task-cccc3333.md')), 'moved to discarded/');

  const again = await post('/memory/discard', { taskId: 'task-cccc3333' });
  assert.equal(again.status, 404);
  const missing = await post('/memory/discard', { taskId: 'task-never-existed' });
  assert.equal(missing.status, 404);
});

test('CORS: memory endpoints echo localhost origins only', async () => {
  const allowed = await getJson('/memory/inbox');
  assert.equal(allowed.status, 200);

  const res = await fetch(BASE + '/memory/inbox', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  await res.json();

  const denied = await post('/memory/discard', { taskId: 'nope' }, { origin: 'https://evil.example.com' });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const pre = await fetch(BASE + '/memory/accept', {
    method: 'OPTIONS',
    headers: { origin: 'http://127.0.0.1:3000', 'access-control-request-method': 'POST' },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3000');
});
