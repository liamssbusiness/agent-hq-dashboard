// Pluggable task runners for the Hermes daemon (Phase 2 of
// docs/AGENTIC-WORKFLOW-PLAN.md).
//
// Interface: runner.run(task, agent, { signal }) -> Promise<{ ok, summary, tokensUsed, costUsd }>
//   - 'mock'   : waits 2-5s and returns a canned result (tests/demo).
//   - 'claude' : spawns `claude -p "<prompt>" --output-format json` in a
//                per-task workspace under <dataDir>/workspaces/<taskId>/.
//                Relies entirely on the user's own `claude` CLI login —
//                the daemon NEVER passes or stores credentials.
//
// Memory hooks (docs/MEMORY-SYSTEM.md conventions):
//   - before a 'claude' run, the agent's memory/agents/<dir>/longterm.md
//     (if present) is prepended to the prompt as a "## Your memory" block,
//     truncated to ~2000 chars;
//   - after ANY successful run, the daemon appends an episode line to
//     memory/episodes/YYYY-MM.jsonl via appendEpisode() below.

import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';

/** Agent-id -> memory directory name under memory/agents/. */
export const MEMORY_DIRS = {
  hub: 'alfred',
  code: 'code-lab',
  ads: 'ads-studio',
  trading: 'trading-desk',
  social: 'social-chamber',
  revify: 'revify-hq',
  learning: 'learning-room',
};

const CLAUDE_TIMEOUT_MS = 5 * 60 * 1000; // per-run wall clock (plan doc §4)
const MEMORY_SNIPPET_CHARS = 2000; // ~ the plan's default injection budget

const rand = (min, max) => min + Math.random() * (max - min);

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
    if (signal) {
      if (signal.aborted) {
        clearTimeout(t);
        return resolve();
      }
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    }
  });
}

/** Read the agent's longterm.md (truncated) or null if absent/unmapped. */
function readLongterm(memoryRoot, agentId) {
  const dir = MEMORY_DIRS[agentId];
  if (!dir) return null;
  try {
    const text = readFileSync(path.join(memoryRoot, 'agents', dir, 'longterm.md'), 'utf8');
    if (!text.trim()) return null;
    return text.length > MEMORY_SNIPPET_CHARS
      ? text.slice(0, MEMORY_SNIPPET_CHARS) + '\n…(truncated)'
      : text;
  } catch {
    return null;
  }
}

/**
 * Append a task episode to memory/episodes/YYYY-MM.jsonl (created if missing).
 * Format matches memory/episodes/2026-07.jsonl.example — append-only, one JSON
 * object per line, never edited. Failures are logged, never thrown: memory is
 * best-effort, the task result must not depend on it.
 */
export function appendEpisode(memoryRoot, agentId, taskId, summary) {
  try {
    const dir = path.join(memoryRoot, 'episodes');
    mkdirSync(dir, { recursive: true });
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const line = {
      ts: new Date().toISOString(),
      agent: MEMORY_DIRS[agentId] ?? agentId,
      taskId,
      event: 'task_completed',
      summary,
    };
    appendFileSync(path.join(dir, `${month}.jsonl`), JSON.stringify(line) + '\n');
  } catch (err) {
    console.error('[hermes] failed to append episode:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Mock runner
// ---------------------------------------------------------------------------

const MOCK_SUMMARIES = [
  'Drafted the deliverable and left notes in the workspace.',
  'Completed with 2 findings; details in the summary doc.',
  'Done — output validated against the checklist.',
  'Finished; one follow-up suggested for next run.',
];

function createMockRunner() {
  return {
    kind: 'mock',
    async run(task, _agent, { signal } = {}) {
      // 2-5s by default; HERMES_MOCK_DELAY_MS pins it (used by the test suite).
      const pinned = Number(process.env.HERMES_MOCK_DELAY_MS);
      const delay = Number.isFinite(pinned) && pinned >= 0 ? pinned : rand(2000, 5000);
      await sleep(delay, signal);
      if (signal?.aborted) {
        return { ok: false, summary: 'Aborted by kill switch.', tokensUsed: 0, costUsd: 0 };
      }
      return {
        ok: true,
        summary: `${task.title}: ${MOCK_SUMMARIES[Math.floor(Math.random() * MOCK_SUMMARIES.length)]}`,
        tokensUsed: Math.round(rand(400, 3000)),
        costUsd: Math.round(rand(0.001, 0.02) * 10000) / 10000,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Claude runner (headless `claude -p`, one clean context per task)
// ---------------------------------------------------------------------------

function tail(text, chars = 400) {
  const t = (text ?? '').trim();
  return t.length > chars ? '…' + t.slice(-chars) : t;
}

/** Defensively pull cost/tokens/summary out of `--output-format json` output. */
function parseClaudeOutput(stdout) {
  try {
    const out = JSON.parse(stdout);
    const usage = out.usage ?? {};
    const tokensUsed =
      (Number(usage.input_tokens) || 0) +
      (Number(usage.output_tokens) || 0) +
      (Number(usage.cache_creation_input_tokens) || 0) +
      (Number(usage.cache_read_input_tokens) || 0);
    return {
      parsed: true,
      isError: out.is_error === true,
      summary: typeof out.result === 'string' && out.result.trim() ? tail(out.result, 600) : tail(stdout),
      tokensUsed,
      costUsd: Number(out.total_cost_usd) || 0,
    };
  } catch {
    return { parsed: false, isError: false, summary: tail(stdout), tokensUsed: 0, costUsd: 0 };
  }
}

function createClaudeRunner({ dataDir, memoryRoot }) {
  return {
    kind: 'claude',
    run(task, agent, { signal } = {}) {
      return new Promise((resolve) => {
        const workspace = path.join(dataDir, 'workspaces', task.id);
        try {
          mkdirSync(workspace, { recursive: true });
        } catch (err) {
          return resolve({ ok: false, summary: `Could not create workspace: ${err.message}`, tokensUsed: 0, costUsd: 0 });
        }

        let prompt = (task.prompt ?? '').trim() || task.title;
        const memory = readLongterm(memoryRoot, agent.id);
        if (memory) prompt = `## Your memory\n\n${memory}\n\n---\n\n${prompt}`;

        // No credentials are added here — the child inherits the user's own
        // environment and uses their existing `claude` CLI login.
        const child = spawn('claude', ['-p', prompt, '--output-format', 'json'], {
          cwd: workspace,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let settled = false;
        const done = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        };

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, CLAUDE_TIMEOUT_MS);
        timer.unref?.();

        signal?.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });

        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => (stderr += d));

        child.on('error', (err) => {
          done({
            ok: false,
            summary:
              err.code === 'ENOENT'
                ? 'claude CLI not found on PATH — install Claude Code and log in to use the claude runner.'
                : `Failed to spawn claude: ${err.message}`,
            tokensUsed: 0,
            costUsd: 0,
          });
        });

        child.on('close', (code) => {
          if (timedOut) {
            return done({ ok: false, summary: 'Run timed out after 5 minutes and was killed.', tokensUsed: 0, costUsd: 0 });
          }
          if (signal?.aborted) {
            return done({ ok: false, summary: 'Aborted by kill switch.', tokensUsed: 0, costUsd: 0 });
          }
          const out = parseClaudeOutput(stdout);
          if (code !== 0 || out.isError) {
            return done({
              ok: false,
              summary: out.summary || tail(stderr) || `claude exited with code ${code}`,
              tokensUsed: out.tokensUsed,
              costUsd: out.costUsd,
            });
          }
          // Parsing failure is not a task failure: exit 0 means the run
          // finished — fall back to the stdout tail as the summary.
          done({ ok: true, summary: out.summary || '(no output)', tokensUsed: out.tokensUsed, costUsd: out.costUsd });
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------

/**
 * Create a runner. kind: 'mock' | 'claude' (unknown kinds fall back to mock).
 * opts: { dataDir, memoryRoot } — absolute paths owned by the daemon.
 */
export function createRunner(kind, opts) {
  if (kind === 'claude') return createClaudeRunner(opts);
  if (kind !== 'mock') console.warn(`[hermes] unknown HERMES_RUNNER "${kind}", falling back to mock`);
  return createMockRunner();
}
