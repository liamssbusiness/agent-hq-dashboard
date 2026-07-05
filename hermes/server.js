// Hermes daemon — Phase 1-2 (see docs/AGENTIC-WORKFLOW-PLAN.md).
//
// Agent registry + event bus + JSONL persistence & replay + task lifecycle
// with approval gates + kill switch + pluggable runner + WS/REST API + demo
// heartbeat. Events emitted over WebSocket MUST match src/types/events.ts
// exactly — that file is the source of truth for the schema.

import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRunner, appendEpisode } from './runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.HERMES_PORT) || 4870;
// Security: localhost-only by default. Do not change this without adding auth.
const HOST = process.env.HERMES_HOST || '127.0.0.1';
const DEMO = process.env.HERMES_DEMO === '1';
const RUNNER_KIND = process.env.HERMES_RUNNER || 'mock';

const DATA_DIR = process.env.HERMES_DATA_DIR
  ? path.resolve(process.env.HERMES_DATA_DIR)
  : path.join(__dirname, 'data');
const MEMORY_ROOT = process.env.HERMES_MEMORY_DIR
  ? path.resolve(process.env.HERMES_MEMORY_DIR)
  : path.join(__dirname, '..', 'memory');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const MAX_RECENT_MESSAGES = 50;
const MAX_TERMINAL_TASKS = 20; // completed/failed/rejected kept in memory

// Security: only browser pages served from localhost may talk to the daemon.
// Never widen this to a wildcard — the dashboard is the only intended client.
const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

mkdirSync(DATA_DIR, { recursive: true });
// Keep logs out of git, permanently.
const gitignorePath = path.join(DATA_DIR, '.gitignore');
if (!existsSync(gitignorePath)) {
  writeFileSync(gitignorePath, '*\n!.gitignore\n');
}

const registry = JSON.parse(readFileSync(path.join(__dirname, 'agents.json'), 'utf8'));

const runners = {
  mock: createRunner('mock', { dataDir: DATA_DIR, memoryRoot: MEMORY_ROOT }),
  active: createRunner(RUNNER_KIND, { dataDir: DATA_DIR, memoryRoot: MEMORY_ROOT }),
};

// ---------------------------------------------------------------------------
// State (in-memory; events.jsonl is the append-only source of truth)
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'rejected']);

/** Kill switch: while true, no new tasks are accepted or dispatched. */
let paused = false;

/** @type {Map<string, import('../src/types/events.ts').AgentState & {dailyCostCapUsd:number, needsApproval:boolean, tools:string[]}>} */
const agents = new Map();
for (const a of registry.agents) {
  agents.set(a.id, {
    id: a.id,
    name: a.name,
    status: DEMO ? 'idle' : 'offline',
    currentTask: null,
    tasksQueued: 0,
    tokensUsed: 0,
    tokenBudget: a.tokenBudget,
    costUsd: 0,
    updatedAt: Date.now(),
    // internal (not part of AgentState, stripped before serializing)
    dailyCostCapUsd: a.dailyCostCapUsd,
    needsApproval: a.needsApproval === true,
    tools: a.tools ?? [],
  });
}

/** Recent `message` events, kept for snapshots. AgentMessage shape. */
const recentMessages = [];
/**
 * taskId -> TaskInfo + internal fields {prompt?, demo?} stripped by publicTask().
 * Insertion order ≈ creation order (replay preserves it).
 */
const tasks = new Map();
/** taskId -> AbortController for in-flight runner invocations. */
const activeRuns = new Map();
/** agentId -> taskId currently running (concurrency = 1 per agent). */
const runningByAgent = new Map();

/** AgentState exactly as declared in src/types/events.ts (internal fields stripped). */
function publicAgentState(a) {
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    currentTask: a.currentTask,
    tasksQueued: a.tasksQueued,
    tokensUsed: a.tokensUsed,
    tokenBudget: a.tokenBudget,
    costUsd: a.costUsd,
    updatedAt: a.updatedAt,
  };
}

/** TaskInfo exactly as declared in src/types/events.ts (prompt/demo stripped). */
function publicTask(t) {
  const out = {
    id: t.id,
    agentId: t.agentId,
    title: t.title,
    status: t.status,
    needsApproval: t.needsApproval,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
  if (t.summary !== undefined) out.summary = t.summary;
  return out;
}

function snapshotEvent() {
  return {
    type: 'snapshot',
    agents: [...agents.values()].map(publicAgentState),
    messages: recentMessages.slice(-MAX_RECENT_MESSAGES),
    tasks: [...tasks.values()].map(publicTask),
    paused,
    ts: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Event bus: append to JSONL + broadcast to every WebSocket client
// ---------------------------------------------------------------------------

function appendToLog(record) {
  try {
    appendFileSync(EVENTS_FILE, JSON.stringify(record) + '\n');
  } catch (err) {
    console.error('[hermes] failed to append event log:', err.message);
  }
}

/** Emit a schema-valid HermesEvent: persist it and push it to all clients. */
function emit(event) {
  appendToLog(event);
  if (event.type === 'message') {
    recentMessages.push({ from: event.from, to: event.to, text: event.text, ts: event.ts });
    if (recentMessages.length > MAX_RECENT_MESSAGES) recentMessages.shift();
  }
  const frame = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(frame);
  }
}

/** Audit-only record: persisted to events.jsonl but NOT broadcast (not part of the WS schema). */
function audit(action, detail) {
  appendToLog({ type: 'audit', action, ...detail, ts: Date.now() });
}

function setStatus(agent, status, currentTask = agent.currentTask) {
  agent.status = status;
  agent.currentTask = currentTask;
  agent.updatedAt = Date.now();
  emit({ type: 'agent_status', agentId: agent.id, status, currentTask, ts: agent.updatedAt });
}

// ---------------------------------------------------------------------------
// Task lifecycle
// ---------------------------------------------------------------------------

function recountQueued(agentId) {
  const agent = agents.get(agentId);
  if (!agent) return;
  let n = 0;
  for (const t of tasks.values()) {
    if (t.agentId === agentId && (t.status === 'queued' || t.status === 'waiting_approval')) n += 1;
  }
  agent.tasksQueued = n;
  agent.updatedAt = Date.now();
}

/** Drop the oldest terminal tasks beyond the in-memory cap (log keeps everything). */
function pruneTerminalTasks() {
  const terminal = [...tasks.values()].filter((t) => TERMINAL_STATUSES.has(t.status));
  if (terminal.length <= MAX_TERMINAL_TASKS) return;
  terminal.sort((a, b) => a.updatedAt - b.updatedAt);
  for (const t of terminal.slice(0, terminal.length - MAX_TERMINAL_TASKS)) tasks.delete(t.id);
}

/** Move a task to `status`, broadcast task_update, audit-log the transition. */
function transitionTask(task, status, { summary, actor = 'daemon' } = {}) {
  const from = task.status;
  task.status = status;
  task.updatedAt = Date.now();
  if (summary !== undefined) task.summary = summary;
  emit({ type: 'task_update', task: publicTask(task), ts: task.updatedAt });
  audit('task_transition', { taskId: task.id, agentId: task.agentId, from, to: status, actor });
  recountQueued(task.agentId);
  if (TERMINAL_STATUSES.has(status)) pruneTerminalTasks();
}

/** Create a task (REST + demo submitter). Returns {task} or {code, error}. */
function createTask(agentId, title, prompt, { demo = false } = {}) {
  if (paused) return { code: 409, error: 'daemon is paused (kill switch) — POST /resume first' };
  const agent = agents.get(agentId);
  if (!agent) return { code: 400, error: `unknown agentId: ${agentId ?? '(missing)'}` };
  if (typeof title !== 'string' || !title.trim()) return { code: 400, error: 'title is required' };
  if (agent.costUsd >= agent.dailyCostCapUsd) {
    return {
      code: 429,
      error: 'budget cap',
      detail: `agent ${agentId} has spent $${agent.costUsd.toFixed(4)} of its $${agent.dailyCostCapUsd} daily cap`,
    };
  }
  const now = Date.now();
  const task = {
    id: `task-${randomUUID().slice(0, 8)}`,
    agentId,
    title: title.trim(),
    // Approval gate is architecture, not prompts (plan doc §5): agents flagged
    // needsApproval in agents.json cannot reach 'queued' without POST /approve.
    status: agent.needsApproval ? 'waiting_approval' : 'queued',
    needsApproval: agent.needsApproval,
    createdAt: now,
    updatedAt: now,
    // internal
    prompt: typeof prompt === 'string' && prompt.trim() ? prompt.trim() : undefined,
    demo,
  };
  tasks.set(task.id, task);
  recountQueued(agentId);
  emit({ type: 'task_update', task: publicTask(task), ts: now });
  audit('task_created', { taskId: task.id, agentId, title: task.title, status: task.status, demo });
  emit({
    type: 'message',
    from: 'hub',
    to: agentId,
    text: task.status === 'waiting_approval' ? `Task awaiting approval: ${task.title}` : `Task queued: ${task.title}`,
    ts: Date.now(),
  });
  scheduleDispatch();
  return { task };
}

// ---------------------------------------------------------------------------
// Dispatcher: one running task per agent, stopped entirely while paused
// ---------------------------------------------------------------------------

let dispatchScheduled = false;
function scheduleDispatch() {
  if (dispatchScheduled) return;
  dispatchScheduled = true;
  setImmediate(() => {
    dispatchScheduled = false;
    dispatchLoop();
  });
}

function dispatchLoop() {
  if (paused) return;
  for (const agent of agents.values()) {
    if (runningByAgent.has(agent.id) || agent.status === 'working') continue;
    let next = null;
    for (const t of tasks.values()) {
      if (t.agentId === agent.id && t.status === 'queued' && (!next || t.createdAt < next.createdAt)) next = t;
    }
    if (next) runTask(next, agent); // async; not awaited — the loop stays live
  }
}

async function runTask(task, agent) {
  runningByAgent.set(agent.id, task.id);
  transitionTask(task, 'running');
  emit({ type: 'task_started', agentId: agent.id, taskId: task.id, title: task.title, ts: Date.now() });
  setStatus(agent, 'working', task.title);

  const ctrl = new AbortController();
  activeRuns.set(task.id, ctrl);
  // Demo-submitted tasks always use the mock runner, whatever HERMES_RUNNER says.
  const runner = task.demo ? runners.mock : runners.active;

  let result;
  try {
    result = await runner.run(task, agent, { signal: ctrl.signal });
  } catch (err) {
    result = { ok: false, summary: `runner crashed: ${err.message}`, tokensUsed: 0, costUsd: 0 };
  }
  activeRuns.delete(task.id);
  runningByAgent.delete(agent.id);

  // The kill switch may have already failed this task and set agents offline —
  // in that case the (aborted) runner result is discarded.
  if (task.status !== 'running') {
    scheduleDispatch();
    return;
  }

  const ok = result?.ok === true;
  transitionTask(task, ok ? 'completed' : 'failed', {
    summary: typeof result?.summary === 'string' ? result.summary : undefined,
  });
  emit({ type: 'task_completed', agentId: agent.id, taskId: task.id, ok, summary: task.summary, ts: Date.now() });

  const tokens = Number(result?.tokensUsed) || 0;
  const cost = Number(result?.costUsd) || 0;
  if (tokens > 0 || cost > 0) {
    // tokensUsed/costUsd are cumulative per-agent totals.
    agent.tokensUsed += tokens;
    agent.costUsd = Math.round((agent.costUsd + cost) * 10000) / 10000;
    agent.updatedAt = Date.now();
    emit({ type: 'token_usage', agentId: agent.id, tokensUsed: agent.tokensUsed, costUsd: agent.costUsd, ts: agent.updatedAt });
  }
  setStatus(agent, 'idle', null);

  // Memory hook: successful runs (mock included) leave an episode line
  // (memory/episodes/YYYY-MM.jsonl, per docs/MEMORY-SYSTEM.md).
  if (ok) appendEpisode(MEMORY_ROOT, agent.id, task.id, task.summary ?? task.title);

  scheduleDispatch();
}

// ---------------------------------------------------------------------------
// Kill switch
// ---------------------------------------------------------------------------

function killSwitch() {
  if (paused) return { alreadyPaused: true };
  paused = true;
  // Abort in-flight runs first so their (late) results are discarded.
  for (const ctrl of activeRuns.values()) ctrl.abort();
  for (const t of tasks.values()) {
    if (t.status === 'running') {
      transitionTask(t, 'failed', { summary: 'Killed by /kill switch.', actor: 'kill' });
      emit({ type: 'task_completed', agentId: t.agentId, taskId: t.id, ok: false, summary: t.summary, ts: Date.now() });
    }
  }
  for (const agent of agents.values()) setStatus(agent, 'offline', null);
  emit({ type: 'daemon_paused', ts: Date.now() });
  audit('kill', { runningAborted: activeRuns.size });
  return { alreadyPaused: false };
}

function resume() {
  if (!paused) return { alreadyRunning: true };
  paused = false;
  for (const agent of agents.values()) setStatus(agent, 'idle', null);
  emit({ type: 'daemon_resumed', ts: Date.now() });
  audit('resume', {});
  scheduleDispatch();
  return { alreadyRunning: false };
}

// ---------------------------------------------------------------------------
// State replay: rebuild agents/tasks/messages/paused from events.jsonl
// ---------------------------------------------------------------------------

function replayEventLog() {
  if (!existsSync(EVENTS_FILE)) return;
  let lines;
  try {
    lines = readFileSync(EVENTS_FILE, 'utf8').split('\n');
  } catch (err) {
    console.error('[hermes] could not read event log for replay:', err.message);
    return;
  }
  let applied = 0;
  let skipped = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      skipped += 1; // corrupt line
      continue;
    }
    try {
      if (applyReplayedEvent(ev)) applied += 1;
      else skipped += 1; // unknown/irrelevant event type
    } catch {
      skipped += 1; // malformed payload
    }
  }

  // Normalize after replay:
  // - a task left 'running' means the previous daemon died mid-run — fail it;
  // - 'working' agents likewise return to idle (no run survives a restart);
  // - recount queues, cap the terminal-task memory.
  for (const t of tasks.values()) {
    if (t.status === 'running') {
      transitionTask(t, 'failed', { summary: 'Daemon restarted while this task was running.', actor: 'replay' });
    }
  }
  for (const agent of agents.values()) {
    if (agent.status === 'working') {
      agent.status = 'idle';
      agent.currentTask = null;
    }
    if (DEMO && agent.status === 'offline') agent.status = 'idle';
    recountQueued(agent.id);
  }
  pruneTerminalTasks();
  console.log(`[hermes] replayed ${applied} events from ${EVENTS_FILE} (${skipped} skipped), ${tasks.size} tasks restored${paused ? ', PAUSED' : ''}`);
  audit('replay_done', { applied, skipped, tasks: tasks.size, paused });
}

/** Apply one persisted event to in-memory state. Returns false for irrelevant types. */
function applyReplayedEvent(ev) {
  switch (ev.type) {
    case 'message': {
      if (typeof ev.text !== 'string') return false;
      recentMessages.push({ from: ev.from, to: ev.to, text: ev.text, ts: ev.ts });
      if (recentMessages.length > MAX_RECENT_MESSAGES) recentMessages.shift();
      return true;
    }
    case 'token_usage': {
      const agent = agents.get(ev.agentId);
      if (!agent) return false;
      // Cumulative totals: the latest event wins.
      if (Number.isFinite(ev.tokensUsed)) agent.tokensUsed = ev.tokensUsed;
      if (Number.isFinite(ev.costUsd)) agent.costUsd = ev.costUsd;
      agent.updatedAt = ev.ts ?? Date.now();
      return true;
    }
    case 'agent_status': {
      const agent = agents.get(ev.agentId);
      if (!agent || typeof ev.status !== 'string') return false;
      agent.status = ev.status;
      agent.currentTask = ev.currentTask ?? null;
      agent.updatedAt = ev.ts ?? Date.now();
      return true;
    }
    case 'task_update': {
      const t = ev.task;
      if (!t || typeof t.id !== 'string' || !agents.has(t.agentId)) return false;
      const existing = tasks.get(t.id);
      // Replayed tasks lose their internal prompt (it is never persisted);
      // a re-dispatched replayed task falls back to its title as the prompt.
      tasks.set(t.id, { ...(existing ?? {}), ...t });
      return true;
    }
    case 'daemon_paused':
      paused = true;
      return true;
    case 'daemon_resumed':
      paused = false;
      return true;
    default:
      return false; // audit records, snapshots, task_started/completed, errors: not state-bearing here
  }
}

// ---------------------------------------------------------------------------
// HTTP (REST) server — CORS restricted to localhost origins, never wildcard
// ---------------------------------------------------------------------------

/** CORS headers iff the Origin header is a localhost origin. Never '*'. */
function corsHeaders(req) {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && ALLOWED_ORIGIN_RE.test(origin)) {
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return {};
}

function sendJson(req, res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', ...corsHeaders(req) });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 64 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function parseJsonBody(req) {
  try {
    return { body: JSON.parse((await readBody(req)) || '{}') };
  } catch {
    return { err: 'invalid JSON body' };
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (req.method === 'OPTIONS') {
      // Preflight for the dashboard's JSON POSTs. Allow-origin only appears
      // for localhost origins (corsHeaders) — other origins get no grant.
      res.writeHead(204, {
        ...corsHeaders(req),
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
      });
      return res.end();
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(req, res, 200, { ok: true, paused });
    }

    if (req.method === 'GET' && url.pathname === '/state') {
      return sendJson(req, res, 200, {
        agents: [...agents.values()].map(publicAgentState),
        messages: recentMessages.slice(-MAX_RECENT_MESSAGES),
        tasks: [...tasks.values()].map(publicTask),
        paused,
        ts: Date.now(),
      });
    }

    if (req.method === 'POST' && url.pathname === '/tasks') {
      const { body, err } = await parseJsonBody(req);
      if (err) return sendJson(req, res, 400, { error: err });
      const out = createTask(body.agentId, body.title, body.prompt);
      if (out.error) return sendJson(req, res, out.code, { error: out.error, detail: out.detail });
      return sendJson(req, res, 201, { ok: true, taskId: out.task.id, status: out.task.status });
    }

    if (req.method === 'POST' && url.pathname === '/approve') {
      const { body, err } = await parseJsonBody(req);
      if (err) return sendJson(req, res, 400, { error: err });
      const task = tasks.get(body.taskId);
      if (!task) return sendJson(req, res, 404, { error: `unknown taskId: ${body.taskId ?? '(missing)'}` });
      if (task.status !== 'waiting_approval') {
        return sendJson(req, res, 409, { error: `task is '${task.status}', not 'waiting_approval'` });
      }
      // Approval gate philosophy: approvals are audit events first — the black-box
      // recorder for anything that would spend money or publish (plan doc §5).
      transitionTask(task, 'queued', { actor: 'human-approve' });
      audit('task_approved', { taskId: task.id, agentId: task.agentId, title: task.title });
      emit({ type: 'message', from: 'hub', to: task.agentId, text: `Task approved: ${task.title}`, ts: Date.now() });
      scheduleDispatch();
      return sendJson(req, res, 200, { ok: true, taskId: task.id, status: task.status });
    }

    if (req.method === 'POST' && url.pathname === '/reject') {
      const { body, err } = await parseJsonBody(req);
      if (err) return sendJson(req, res, 400, { error: err });
      const task = tasks.get(body.taskId);
      if (!task) return sendJson(req, res, 404, { error: `unknown taskId: ${body.taskId ?? '(missing)'}` });
      if (task.status !== 'waiting_approval' && task.status !== 'queued') {
        return sendJson(req, res, 409, { error: `task is '${task.status}' and can no longer be rejected` });
      }
      transitionTask(task, 'rejected', { summary: 'Rejected by human.', actor: 'human-reject' });
      audit('task_rejected', { taskId: task.id, agentId: task.agentId, title: task.title });
      emit({ type: 'message', from: 'hub', to: task.agentId, text: `Task rejected: ${task.title}`, ts: Date.now() });
      return sendJson(req, res, 200, { ok: true, taskId: task.id, status: task.status });
    }

    if (req.method === 'POST' && url.pathname === '/kill') {
      const { alreadyPaused } = killSwitch();
      return sendJson(req, res, 200, { ok: true, paused: true, alreadyPaused });
    }

    if (req.method === 'POST' && url.pathname === '/resume') {
      const { alreadyRunning } = resume();
      return sendJson(req, res, 200, { ok: true, paused: false, alreadyRunning });
    }

    return sendJson(req, res, 404, { error: 'not found' });
  } catch (err) {
    return sendJson(req, res, 500, { error: err.message });
  }
});

// ---------------------------------------------------------------------------
// WebSocket server (same port). On connect: send a snapshot, then live events.
// Browser clients must come from a localhost origin; non-browser clients
// (no Origin header) are allowed.
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({
  server,
  verifyClient: ({ origin }) => !origin || ALLOWED_ORIGIN_RE.test(origin),
});

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(snapshotEvent()));
});

// ---------------------------------------------------------------------------
// Demo heartbeat: simulated chatter/drift every 2-4s, plus a real demo task
// submitted every ~20s to a non-approval agent (always run by the mock runner)
// so the full task lifecycle stays visible on the dashboard.
// ---------------------------------------------------------------------------

const DEMO_TASKS = {
  hub: ['Route morning task queue', 'Summarize overnight agent activity', 'Compile approval digest'],
  code: ['Fix failing test in revify-api', 'Refactor auth middleware', 'Review dependabot PRs', 'Add e2e test for checkout'],
  ads: ['Draft Q3 campaign copy', 'Analyze CTR drop on campaign #12', 'Propose audience segments for launch'],
  trading: ['Backtest momentum strategy on SPY', 'Update watchlist from earnings calendar', 'Paper-trade signal review'],
  social: ['Draft thread on launch announcement', 'Prepare weekly content calendar', 'Draft replies to top mentions'],
  revify: ['Generate weekly churn report', 'Summarize new lead sources', 'Draft roadmap item from feedback themes'],
  learning: ['Summarize Claude SDK changelog', 'Digest new agent-orchestration papers', 'Write notes on WS reconnect patterns'],
};

const DEMO_MESSAGES = [
  { from: 'ads', to: 'hub', text: 'Campaign draft ready for review' },
  { from: 'hub', to: 'code', text: 'New task assigned: fix failing test in revify-api' },
  { from: 'code', to: 'hub', text: 'Opened PR #17 — tests green, awaiting review' },
  { from: 'revify', to: 'hub', text: 'Weekly churn report drafted: churn down 0.4%' },
  { from: 'learning', to: 'code', text: 'New SDK release notes summarized — 2 breaking changes flagged' },
  { from: 'trading', to: 'hub', text: 'Backtest complete: strategy Sharpe 1.3 on paper account' },
  { from: 'social', to: 'hub', text: '3 post drafts queued for approval' },
  { from: 'hub', to: 'revify', text: 'Please include lead-source breakdown in next report' },
  { from: 'ads', to: 'social', text: 'Sharing approved campaign visuals for post drafts' },
  { from: 'learning', to: 'hub', text: 'Digest ready: 4 papers on multi-agent memory' },
];

const DEMO_ERRORS = [
  'Rate limited by upstream API (429), backing off',
  'Tool call timed out after 30s',
  'Workspace checkout failed: lockfile conflict',
];

let heartbeatTimer = null;
let demoSubmitTimer = null;

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function demoTick() {
  if (!paused) {
    const all = [...agents.values()];
    const idle = all.filter((a) => a.status === 'idle');
    const working = all.filter((a) => a.status === 'working');
    const roll = Math.random();

    if (roll < 0.05 && idle.length > 0) {
      // Rare transient error on an idle agent (real task failures come from the runner).
      const agent = pick(idle);
      emit({ type: 'error', agentId: agent.id, message: pick(DEMO_ERRORS), ts: Date.now() });
      setStatus(agent, 'error', null);
      setTimeout(() => {
        if (agents.get(agent.id)?.status === 'error' && !paused) setStatus(agents.get(agent.id), 'idle', null);
      }, rand(5000, 9000)).unref?.();
    } else if (roll < 0.35 && working.length > 0) {
      // Token drift for a working agent (tokensUsed/costUsd are cumulative totals).
      const agent = pick(working);
      agent.tokensUsed += Math.round(rand(400, 3000));
      agent.costUsd = Math.round((agent.costUsd + rand(0.001, 0.02)) * 10000) / 10000;
      agent.updatedAt = Date.now();
      emit({ type: 'token_usage', agentId: agent.id, tokensUsed: agent.tokensUsed, costUsd: agent.costUsd, ts: agent.updatedAt });
    } else {
      // Chatter between rooms.
      const m = pick(DEMO_MESSAGES);
      emit({ type: 'message', from: m.from, to: m.to, text: m.text, ts: Date.now() });
    }
  }
  heartbeatTimer = setTimeout(demoTick, rand(2000, 4000));
}

function demoSubmitTick() {
  if (!paused) {
    // Only non-approval agents, so the lifecycle runs unattended.
    const eligible = [...agents.values()].filter((a) => !a.needsApproval);
    if (eligible.length > 0) {
      const agent = pick(eligible);
      const title = pick(DEMO_TASKS[agent.id] ?? ['Do the thing']);
      const out = createTask(agent.id, title, undefined, { demo: true });
      if (out.error) console.warn(`[hermes] demo task skipped: ${out.error}`);
    }
  }
  demoSubmitTimer = setTimeout(demoSubmitTick, rand(15000, 25000));
}

// ---------------------------------------------------------------------------
// Startup + graceful shutdown
// ---------------------------------------------------------------------------

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[hermes] port ${PORT} is already in use (another daemon running?) — exiting`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  // Replay only after the port is bound: a second daemon on the same data dir
  // must die on EADDRINUSE *before* it writes anything to the shared log.
  replayEventLog();
  console.log(
    `[hermes] listening on http://${HOST}:${PORT} (ws://${HOST}:${PORT})${DEMO ? ' [demo mode]' : ''} [runner: ${RUNNER_KIND}]`,
  );
  audit('daemon_started', { demo: DEMO, host: HOST, port: PORT, runner: RUNNER_KIND, paused });
  if (DEMO) {
    heartbeatTimer = setTimeout(demoTick, 1000);
    demoSubmitTimer = setTimeout(demoSubmitTick, 3000);
  }
  scheduleDispatch(); // pick up replayed queued tasks
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[hermes] ${signal} received, shutting down...`);
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  if (demoSubmitTimer) clearTimeout(demoSubmitTimer);
  for (const ctrl of activeRuns.values()) ctrl.abort();
  audit('daemon_stopped', { signal });
  for (const client of wss.clients) client.close(1001, 'server shutting down');
  wss.close();
  server.close(() => process.exit(0));
  // Hard exit fallback if a connection lingers.
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
