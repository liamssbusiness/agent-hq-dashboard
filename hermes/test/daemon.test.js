// Integration tests for the Hermes daemon (plain node:test).
// Boots the real server.js as a child process on a random port with demo mode
// off, a temp data dir, a temp memory root, and a fast-pinned mock runner.
//
// Run: node --test test/   (or: npm test)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, '..', 'server.js');

const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(path.join(os.tmpdir(), 'hermes-test-'));
const DATA_DIR = path.join(TMP, 'data');
const MEMORY_DIR = path.join(TMP, 'memory');

const ENV = {
  ...process.env,
  HERMES_PORT: String(PORT),
  HERMES_DATA_DIR: DATA_DIR,
  HERMES_MEMORY_DIR: MEMORY_DIR,
  HERMES_RUNNER: 'mock',
  HERMES_MOCK_DELAY_MS: '150', // pin the mock's 2-5s wait for fast tests
  HERMES_DEMO: '0',
};

let child = null;

function startDaemon() {
  child = spawn(process.execPath, [SERVER], { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => process.stderr.write(`[daemon] ${d}`));
  return waitFor(async () => (await getJson('/health')).ok === true, 'daemon /health', 8000);
}

function stopDaemon() {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 3000).unref();
  });
}

async function getJson(pathname) {
  const res = await fetch(BASE + pathname);
  return res.json();
}

async function post(pathname, body, headers = {}) {
  const res = await fetch(BASE + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

async function waitFor(fn, what, timeoutMs = 6000, everyMs = 60) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await fn()) return;
    } catch {
      // not up yet / condition threw — keep polling
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

/** WS client that records every event; waitForEvent polls the recording. */
function connectWs(origin = 'http://localhost:5173') {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin });
  const events = [];
  ws.on('message', (data) => {
    try {
      events.push(JSON.parse(data.toString()));
    } catch {
      // ignore
    }
  });
  const open = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const waitForEvent = async (pred, what, timeoutMs = 6000) => {
    await waitFor(() => events.some(pred), what, timeoutMs);
    return events.find(pred);
  };
  return { ws, events, open, waitForEvent };
}

function taskFromState(state, taskId) {
  return state.tasks.find((t) => t.id === taskId);
}

before(async () => {
  await startDaemon();
});

after(async () => {
  await stopDaemon();
  rmSync(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

test('GET /health responds ok', async () => {
  const health = await getJson('/health');
  assert.equal(health.ok, true);
});

test('task lifecycle: queued -> running -> completed with task_update events over WS', async () => {
  const client = connectWs();
  await client.open;

  const snapshot = await client.waitForEvent((e) => e.type === 'snapshot', 'snapshot on connect');
  assert.equal(snapshot.paused, false);
  assert.ok(Array.isArray(snapshot.tasks));
  assert.ok(Array.isArray(snapshot.agents));

  const { status, body } = await post('/tasks', { agentId: 'code', title: 'Test lifecycle task', prompt: 'do the thing' });
  assert.equal(status, 201);
  assert.equal(body.status, 'queued');
  const taskId = body.taskId;

  await client.waitForEvent(
    (e) => e.type === 'task_update' && e.task.id === taskId && e.task.status === 'completed',
    'task_update completed',
  );

  // Full ordered status trail observed on the WS client.
  const trail = client.events.filter((e) => e.type === 'task_update' && e.task.id === taskId).map((e) => e.task.status);
  assert.deepEqual(trail, ['queued', 'running', 'completed']);

  // Companion events per the contract.
  assert.ok(client.events.some((e) => e.type === 'task_started' && e.taskId === taskId));
  const completed = client.events.find((e) => e.type === 'task_completed' && e.taskId === taskId);
  assert.equal(completed.ok, true);
  const usage = client.events.find((e) => e.type === 'token_usage' && e.agentId === 'code');
  assert.ok(usage && usage.tokensUsed > 0);

  // State reflects cumulative usage and the terminal task.
  const state = await getJson('/state');
  const code = state.agents.find((a) => a.id === 'code');
  assert.ok(code.tokensUsed > 0);
  assert.ok(code.costUsd > 0);
  assert.equal(code.status, 'idle');
  assert.equal(taskFromState(state, taskId).status, 'completed');
  assert.ok(typeof taskFromState(state, taskId).summary === 'string');

  // Successful run left an episode line in the memory root.
  const month = new Date().toISOString().slice(0, 7);
  const episodesFile = path.join(MEMORY_DIR, 'episodes', `${month}.jsonl`);
  assert.ok(existsSync(episodesFile), 'episodes file created');
  const lines = readFileSync(episodesFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const ep = lines.find((l) => l.taskId === taskId);
  assert.ok(ep, 'episode line for the task');
  assert.equal(ep.agent, 'code-lab');
  assert.equal(ep.event, 'task_completed');

  client.ws.close();
});

test('approval gate: ads task waits for approval; /approve runs it; /reject is terminal', async () => {
  const client = connectWs();
  await client.open;

  // needsApproval agent -> waiting_approval, no auto-dispatch.
  const created = await post('/tasks', { agentId: 'ads', title: 'Draft campaign copy' });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'waiting_approval');
  const taskId = created.body.taskId;

  // Give the dispatcher a beat: the task must NOT start on its own.
  await new Promise((r) => setTimeout(r, 400));
  let state = await getJson('/state');
  assert.equal(taskFromState(state, taskId).status, 'waiting_approval');

  const approved = await post('/approve', { taskId });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'queued');

  await client.waitForEvent(
    (e) => e.type === 'task_update' && e.task.id === taskId && e.task.status === 'completed',
    'approved task completes',
  );

  // Second ads task gets rejected and is terminal.
  const second = await post('/tasks', { agentId: 'ads', title: 'Another risky draft' });
  assert.equal(second.body.status, 'waiting_approval');
  const rejected = await post('/reject', { taskId: second.body.taskId });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.status, 'rejected');

  // Terminal: approving a rejected task is refused.
  const lateApprove = await post('/approve', { taskId: second.body.taskId });
  assert.equal(lateApprove.status, 409);

  await new Promise((r) => setTimeout(r, 400));
  state = await getJson('/state');
  assert.equal(taskFromState(state, second.body.taskId).status, 'rejected');

  client.ws.close();
});

test('kill switch: /kill pauses everything, /resume recovers', async () => {
  const client = connectWs();
  await client.open;

  // Get a task running so /kill has something to fail.
  const created = await post('/tasks', { agentId: 'revify', title: 'Long report', prompt: 'churn report' });
  const taskId = created.body.taskId;
  await client.waitForEvent(
    (e) => e.type === 'task_update' && e.task.id === taskId && e.task.status === 'running',
    'task running before kill',
  );

  const killed = await post('/kill', {});
  assert.equal(killed.status, 200);
  assert.equal(killed.body.paused, true);
  await client.waitForEvent((e) => e.type === 'daemon_paused', 'daemon_paused broadcast');

  let state = await getJson('/state');
  assert.equal(state.paused, true);
  assert.ok(state.agents.every((a) => a.status === 'offline'), 'all agents offline');
  assert.equal(taskFromState(state, taskId).status, 'failed');

  // No new tasks while paused.
  const refused = await post('/tasks', { agentId: 'code', title: 'Should be refused' });
  assert.equal(refused.status, 409);

  const resumed = await post('/resume', {});
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.paused, false);
  await client.waitForEvent((e) => e.type === 'daemon_resumed', 'daemon_resumed broadcast');

  state = await getJson('/state');
  assert.equal(state.paused, false);
  assert.ok(state.agents.every((a) => a.status === 'idle'), 'all agents back to idle');

  // Tasks are accepted (and run) again.
  const again = await post('/tasks', { agentId: 'code', title: 'Post-resume task' });
  assert.equal(again.status, 201);
  await client.waitForEvent(
    (e) => e.type === 'task_update' && e.task.id === again.body.taskId && e.task.status === 'completed',
    'post-resume task completes',
  );

  client.ws.close();
});

test('CORS: localhost origins echoed, others get no allow-origin', async () => {
  const allowed = await post('/tasks', { agentId: 'learning', title: 'CORS check' }, { origin: 'http://localhost:5173' });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');

  const denied = await post('/kill', {}, { origin: 'https://evil.example.com' });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  await post('/resume', {}); // undo the kill from the denied-origin check (server-side it still ran)

  // Preflight
  const pre = await fetch(BASE + '/tasks', {
    method: 'OPTIONS',
    headers: { origin: 'http://127.0.0.1:3000', 'access-control-request-method': 'POST' },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3000');
  assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
  assert.match(pre.headers.get('access-control-allow-headers'), /content-type/);
});

test('restart replay: cumulative tokens and terminal tasks survive a restart', async () => {
  // Ensure at least one completed task exists, then capture the pre-restart state.
  const created = await post('/tasks', { agentId: 'learning', title: 'Replay survivor', prompt: 'digest' });
  const taskId = created.body.taskId;
  await waitFor(async () => {
    const s = await getJson('/state');
    return taskFromState(s, taskId)?.status === 'completed';
  }, 'replay-survivor task completes');

  const preState = await getJson('/state');
  const preLearning = preState.agents.find((a) => a.id === 'learning');
  assert.ok(preLearning.tokensUsed > 0);

  await stopDaemon();
  await startDaemon(); // same HERMES_DATA_DIR -> replays events.jsonl

  const postState = await getJson('/state');
  const postLearning = postState.agents.find((a) => a.id === 'learning');
  assert.equal(postLearning.tokensUsed, preLearning.tokensUsed, 'cumulative tokens replayed');
  assert.equal(postLearning.costUsd, preLearning.costUsd, 'cumulative cost replayed');

  const replayed = taskFromState(postState, taskId);
  assert.ok(replayed, 'completed task replayed');
  assert.equal(replayed.status, 'completed');
  assert.equal(postState.paused, false);
});
