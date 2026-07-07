import { useCallback, useEffect, useState } from 'react';
import type { AgentMessage, AgentState, TaskInfo, TaskStatus } from '../types/events';
import { hermesGet, hermesPost } from '../hooks/useHermes';

interface MemoryProposal {
  taskId: string;
  agent: string; // memory-dir name, e.g. "learning-room"
  proposed: string;
  learnings: string[];
}

const INBOX_POLL_MS = 10_000;

interface OpsPanelProps {
  agents: Record<string, AgentState>;
  tasks: Record<string, TaskInfo>;
  messages: AgentMessage[];
  paused: boolean;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  queued: 'text-cyan-300',
  waiting_approval: 'text-yellow-400',
  running: 'text-green-400',
  completed: 'text-green-300/60',
  failed: 'text-red-400',
  rejected: 'text-red-300/60',
};

/**
 * Operations sidebar shown while connected to Hermes: pending approvals,
 * recent tasks, message feed, and the kill switch. All actions go through the
 * daemon's REST API — the dashboard itself holds no credentials or authority.
 */
const OpsPanel: React.FC<OpsPanelProps> = ({ agents, tasks, messages, paused }) => {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newAgent, setNewAgent] = useState('learning');
  const [newTitle, setNewTitle] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [submitNote, setSubmitNote] = useState<string | null>(null);
  const [inbox, setInbox] = useState<MemoryProposal[]>([]);

  const nameOf = (id: string) => agents[id]?.name ?? id;

  const refreshInbox = useCallback(async () => {
    try {
      const res = (await hermesGet('/memory/inbox')) as { proposals?: MemoryProposal[] };
      setInbox(res.proposals ?? []);
    } catch {
      // Daemon unreachable — badge already reflects it
    }
  }, []);

  useEffect(() => {
    refreshInbox();
    const t = window.setInterval(refreshInbox, INBOX_POLL_MS);
    return () => window.clearInterval(t);
  }, [refreshInbox]);

  const submitTask = () =>
    act(async () => {
      const body: Record<string, unknown> = { agentId: newAgent, title: newTitle.trim() };
      if (newPrompt.trim()) body.prompt = newPrompt.trim();
      const res = (await hermesPost('/tasks', body)) as { ok?: boolean; status?: string; error?: string };
      if (res.ok) {
        setSubmitNote(`Submitted (${res.status ?? 'queued'})`);
        setNewTitle('');
        setNewPrompt('');
      } else {
        setSubmitNote(`Rejected: ${res.error ?? 'unknown error'}`);
      }
    });

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      // Daemon unreachable — the LIVE/MOCK badge already reflects that
    } finally {
      setBusy(false);
    }
  };

  const taskList = Object.values(tasks).sort((a, b) => b.updatedAt - a.updatedAt);
  const pending = taskList.filter((t) => t.status === 'waiting_approval');
  const recent = taskList.filter((t) => t.status !== 'waiting_approval').slice(0, 6);
  const recentMessages = messages.slice(-5).reverse();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-6 right-6 bg-black/80 border-2 border-cyan-500/50 text-cyan-300 text-sm px-3 py-2 rounded hover:bg-cyan-500/10"
      >
        ⚙ Ops {pending.length > 0 && <span className="text-yellow-400">({pending.length} pending)</span>}
      </button>
    );
  }

  return (
    <div className="absolute bottom-6 right-6 w-80 max-h-[70%] overflow-y-auto bg-black/85 border-2 border-cyan-500/50 rounded p-3 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-cyan-400 font-bold text-sm">Operations</h3>
        <button onClick={() => setOpen(false)} className="text-cyan-300/60 hover:text-cyan-300">
          ✕
        </button>
      </div>

      {/* Kill switch */}
      <button
        disabled={busy}
        onClick={() => act(() => hermesPost(paused ? '/resume' : '/kill'))}
        className={
          paused
            ? 'w-full border-2 border-green-500 text-green-400 font-bold py-2 rounded hover:bg-green-500/10 disabled:opacity-50'
            : 'w-full border-2 border-red-500 text-red-400 font-bold py-2 rounded hover:bg-red-500/10 disabled:opacity-50'
        }
      >
        {paused ? '▶ RESUME DAEMON' : '■ KILL SWITCH'}
      </button>
      {paused && <p className="text-red-400">Daemon paused — no tasks will run until resumed.</p>}

      {/* New task */}
      <div>
        <h4 className="text-cyan-400 font-bold mb-1">New Task</h4>
        <div className="space-y-1">
          <select
            value={newAgent}
            onChange={(e) => setNewAgent(e.target.value)}
            className="w-full bg-black border border-cyan-500/40 text-cyan-100 rounded p-1"
          >
            {Object.values(agents).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title"
            className="w-full bg-black border border-cyan-500/40 text-cyan-100 rounded p-1 placeholder:text-cyan-300/30"
          />
          <textarea
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Prompt (optional — defaults to title)"
            rows={2}
            className="w-full bg-black border border-cyan-500/40 text-cyan-100 rounded p-1 placeholder:text-cyan-300/30"
          />
          <button
            disabled={busy || !newTitle.trim()}
            onClick={submitTask}
            className="w-full border border-cyan-400 text-cyan-300 rounded py-1 hover:bg-cyan-500/10 disabled:opacity-40"
          >
            Submit Task
          </button>
          {submitNote && <p className="text-cyan-300/70">{submitNote}</p>}
        </div>
      </div>

      {/* Pending approvals */}
      <div>
        <h4 className="text-yellow-400 font-bold mb-1">Pending Approval ({pending.length})</h4>
        {pending.length === 0 && <p className="text-cyan-300/40">Nothing waiting.</p>}
        {pending.map((t) => (
          <div key={t.id} className="border border-yellow-400/40 rounded p-2 mb-2">
            <p className="text-yellow-200">
              {nameOf(t.agentId)}: <span className="text-white">{t.title}</span>
            </p>
            <div className="flex gap-2 mt-1">
              <button
                disabled={busy}
                onClick={() => act(() => hermesPost('/approve', { taskId: t.id }))}
                className="flex-1 border border-green-500 text-green-400 rounded py-1 hover:bg-green-500/10 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                disabled={busy}
                onClick={() => act(() => hermesPost('/reject', { taskId: t.id }))}
                className="flex-1 border border-red-500 text-red-400 rounded py-1 hover:bg-red-500/10 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Memory inbox — learnings proposed by agents, promoted only on your say-so */}
      <div>
        <h4 className="text-purple-400 font-bold mb-1">Memory Inbox ({inbox.length})</h4>
        {inbox.length === 0 && <p className="text-cyan-300/40">No proposed learnings.</p>}
        {inbox.map((p) => (
          <div key={p.taskId} className="border border-purple-400/40 rounded p-2 mb-2">
            <p className="text-purple-200 mb-1">{p.agent}</p>
            <ul className="text-cyan-100/80 list-disc pl-4 space-y-0.5">
              {p.learnings.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <div className="flex gap-2 mt-1">
              <button
                disabled={busy}
                onClick={() => act(async () => { await hermesPost('/memory/accept', { taskId: p.taskId }); await refreshInbox(); })}
                className="flex-1 border border-green-500 text-green-400 rounded py-1 hover:bg-green-500/10 disabled:opacity-50"
              >
                Accept → memory
              </button>
              <button
                disabled={busy}
                onClick={() => act(async () => { await hermesPost('/memory/discard', { taskId: p.taskId }); await refreshInbox(); })}
                className="flex-1 border border-red-500 text-red-400 rounded py-1 hover:bg-red-500/10 disabled:opacity-50"
              >
                Discard
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Recent tasks */}
      <div>
        <h4 className="text-cyan-400 font-bold mb-1">Recent Tasks</h4>
        {recent.length === 0 && <p className="text-cyan-300/40">No tasks yet.</p>}
        {recent.map((t) => (
          <p key={t.id} className="text-cyan-100/80 truncate">
            <span className={STATUS_COLORS[t.status]}>[{t.status}]</span> {nameOf(t.agentId)}: {t.title}
          </p>
        ))}
      </div>

      {/* Message feed */}
      <div>
        <h4 className="text-cyan-400 font-bold mb-1">Messages</h4>
        {recentMessages.length === 0 && <p className="text-cyan-300/40">No messages yet.</p>}
        {recentMessages.map((m, i) => (
          <p key={`${m.ts}-${i}`} className="text-cyan-100/70 truncate">
            <span className="text-cyan-300">{nameOf(m.from)}</span> → <span className="text-cyan-300">{nameOf(m.to)}</span>:{' '}
            {m.text}
          </p>
        ))}
      </div>
    </div>
  );
};

export default OpsPanel;
