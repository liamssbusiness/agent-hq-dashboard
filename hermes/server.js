// Hermes daemon — Phase 1 skeleton (see docs/AGENTIC-WORKFLOW-PLAN.md).
//
// Agent registry + event bus + JSONL persistence + WS/REST API + demo heartbeat.
// Events emitted over WebSocket MUST match src/types/events.ts exactly —
// that file is the source of truth for the schema.

import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.HERMES_PORT) || 4870;
// Security: localhost-only by default. Do not change this without adding auth.
const HOST = process.env.HERMES_HOST || '127.0.0.1';
const DEMO = process.env.HERMES_DEMO === '1';

const DATA_DIR = path.join(__dirname, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const MAX_RECENT_MESSAGES = 50;

mkdirSync(DATA_DIR, { recursive: true });
// Keep logs out of git, permanently.
const gitignorePath = path.join(DATA_DIR, '.gitignore');
if (!existsSync(gitignorePath)) {
  writeFileSync(gitignorePath, '*\n!.gitignore\n');
}

const registry = JSON.parse(readFileSync(path.join(__dirname, 'agents.json'), 'utf8'));

// ---------------------------------------------------------------------------
// State (in-memory; events.jsonl is the append-only source of truth)
// ---------------------------------------------------------------------------

/** @type {Map<string, import('../src/types/events.ts').AgentState & {dailyCostCapUsd:number, tools:string[]}>} */
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
    tools: a.tools ?? [],
  });
}

/** Recent `message` events, kept for snapshots. AgentMessage shape. */
const recentMessages = [];
/** Stub task store: taskId -> { id, agentId, title, status, approved, createdAt } */
const tasks = new Map();

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

function snapshotEvent() {
  return {
    type: 'snapshot',
    agents: [...agents.values()].map(publicAgentState),
    messages: recentMessages.slice(-MAX_RECENT_MESSAGES),
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
// HTTP (REST) server
// ---------------------------------------------------------------------------

function sendJson(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json' });
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/state') {
      return sendJson(res, 200, {
        agents: [...agents.values()].map(publicAgentState),
        messages: recentMessages.slice(-MAX_RECENT_MESSAGES),
        tasks: [...tasks.values()],
        ts: Date.now(),
      });
    }

    if (req.method === 'POST' && url.pathname === '/tasks') {
      let body;
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        return sendJson(res, 400, { error: 'invalid JSON body' });
      }
      const { agentId, title } = body;
      const agent = agents.get(agentId);
      if (!agent) return sendJson(res, 400, { error: `unknown agentId: ${agentId ?? '(missing)'}` });
      if (typeof title !== 'string' || !title.trim()) {
        return sendJson(res, 400, { error: 'title is required' });
      }
      if (agent.costUsd >= agent.dailyCostCapUsd) {
        return sendJson(res, 429, {
          error: 'budget cap',
          detail: `agent ${agentId} has spent $${agent.costUsd.toFixed(4)} of its $${agent.dailyCostCapUsd} daily cap`,
        });
      }
      const task = {
        id: `task-${randomUUID().slice(0, 8)}`,
        agentId,
        title: title.trim(),
        status: 'queued',
        approved: false,
        createdAt: Date.now(),
      };
      tasks.set(task.id, task);
      agent.tasksQueued += 1;
      agent.updatedAt = Date.now();
      audit('task_queued', { taskId: task.id, agentId, title: task.title });
      emit({ type: 'message', from: 'hub', to: agentId, text: `Task queued: ${task.title}`, ts: Date.now() });
      return sendJson(res, 201, { ok: true, taskId: task.id });
    }

    if (req.method === 'POST' && url.pathname === '/approve') {
      let body;
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        return sendJson(res, 400, { error: 'invalid JSON body' });
      }
      const task = tasks.get(body.taskId);
      if (!task) return sendJson(res, 404, { error: `unknown taskId: ${body.taskId ?? '(missing)'}` });
      if (task.approved) return sendJson(res, 200, { ok: true, taskId: task.id, alreadyApproved: true });
      task.approved = true;
      task.approvedAt = Date.now();
      // Approval gate philosophy: approvals are audit events first — the black-box
      // recorder for anything that would spend money or publish (plan doc §5).
      audit('task_approved', { taskId: task.id, agentId: task.agentId, title: task.title });
      emit({ type: 'message', from: 'hub', to: task.agentId, text: `Task approved: ${task.title}`, ts: Date.now() });
      return sendJson(res, 200, { ok: true, taskId: task.id });
    }

    return sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
});

// ---------------------------------------------------------------------------
// WebSocket server (same port). On connect: send a snapshot, then live events.
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(snapshotEvent()));
});

// ---------------------------------------------------------------------------
// Demo heartbeat: realistic simulated events every 2–4 seconds
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
/** agentId -> { taskId, title } for demo tasks currently "running" */
const demoRunning = new Map();

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function demoTick() {
  const all = [...agents.values()];
  const idle = all.filter((a) => a.status === 'idle');
  const working = all.filter((a) => a.status === 'working');
  const roll = Math.random();

  if (roll < 0.05 && working.length > 0) {
    // Rare error: a working agent fails its task.
    const agent = pick(working);
    const run = demoRunning.get(agent.id);
    emit({ type: 'error', agentId: agent.id, message: pick(DEMO_ERRORS), ts: Date.now() });
    if (run) {
      emit({ type: 'task_completed', agentId: agent.id, taskId: run.taskId, ok: false, summary: `Failed: ${run.title}`, ts: Date.now() });
      demoRunning.delete(agent.id);
    }
    setStatus(agent, 'error', null);
    // Recover to idle a few ticks later.
    setTimeout(() => {
      if (agents.get(agent.id)?.status === 'error') setStatus(agents.get(agent.id), 'idle', null);
    }, rand(5000, 9000)).unref?.();
  } else if (roll < 0.30 && idle.length > 0) {
    // Start a task on an idle agent.
    const agent = pick(idle);
    const title = pick(DEMO_TASKS[agent.id] ?? ['Do the thing']);
    const taskId = `task-${randomUUID().slice(0, 8)}`;
    demoRunning.set(agent.id, { taskId, title });
    emit({ type: 'task_started', agentId: agent.id, taskId, title, ts: Date.now() });
    setStatus(agent, 'working', title);
  } else if (roll < 0.50 && working.length > 0) {
    // Complete a running task.
    const agent = pick(working);
    const run = demoRunning.get(agent.id);
    if (run) {
      emit({ type: 'task_completed', agentId: agent.id, taskId: run.taskId, ok: true, summary: `Done: ${run.title}`, ts: Date.now() });
      demoRunning.delete(agent.id);
    }
    setStatus(agent, 'idle', null);
  } else if (roll < 0.75 && working.length > 0) {
    // Token usage tick for a working agent (tokensUsed/costUsd are cumulative totals).
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

  heartbeatTimer = setTimeout(demoTick, rand(2000, 4000));
}

// ---------------------------------------------------------------------------
// Startup + graceful shutdown
// ---------------------------------------------------------------------------

server.listen(PORT, HOST, () => {
  console.log(`[hermes] listening on http://${HOST}:${PORT} (ws://${HOST}:${PORT})${DEMO ? ' [demo mode]' : ''}`);
  audit('daemon_started', { demo: DEMO, host: HOST, port: PORT });
  if (DEMO) heartbeatTimer = setTimeout(demoTick, 1000);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[hermes] ${signal} received, shutting down...`);
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  audit('daemon_stopped', { signal });
  for (const client of wss.clients) client.close(1001, 'server shutting down');
  wss.close();
  server.close(() => process.exit(0));
  // Hard exit fallback if a connection lingers.
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
