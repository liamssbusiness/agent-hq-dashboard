import { useState } from 'react';
import type { AgentMessage, AgentState, TaskInfo, TaskStatus } from '../types/events';
import { hermesPost } from '../hooks/useHermes';

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

  const nameOf = (id: string) => agents[id]?.name ?? id;

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
