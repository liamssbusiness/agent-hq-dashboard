import { useEffect, useState } from 'react';
import type { AgentMessage, AgentState, CommunicationFlow, HermesEvent } from '../types/events';
import { HERMES_DEFAULT_URL } from '../types/events';

export interface HermesState {
  /** True while a WebSocket connection to the Hermes daemon is open. */
  connected: boolean;
  /** Live agent state keyed by agent id. Empty until the first snapshot. */
  agents: Record<string, AgentState>;
  /** Rolling window of recent inter-agent messages (newest last). */
  messages: AgentMessage[];
}

const MAX_MESSAGES = 50;
const FLOW_WINDOW_MS = 30_000; // messages older than this drop out of the graph
const FLOW_ACTIVE_MS = 10_000; // edges with traffic this recent glow as active
const MAX_RECONNECT_DELAY_MS = 10_000;

/**
 * Connects to the Hermes daemon and folds its event stream into dashboard
 * state. Reconnects with capped exponential backoff; `connected` flips false
 * whenever the daemon is unreachable so callers can fall back to mock data.
 * Set VITE_USE_MOCKS=1 to skip connecting entirely.
 */
export function useHermes(): HermesState {
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Record<string, AgentState>>({});
  const [messages, setMessages] = useState<AgentMessage[]>([]);

  useEffect(() => {
    if (import.meta.env.VITE_USE_MOCKS === '1') return;
    const url = (import.meta.env.VITE_HERMES_URL as string | undefined) ?? HERMES_DEFAULT_URL;

    let ws: WebSocket | null = null;
    let retries = 0;
    let timer: number | undefined;
    let disposed = false;

    const patchAgent = (agentId: string, patch: Partial<AgentState>) => {
      setAgents((prev) => {
        const current = prev[agentId];
        if (!current) return prev;
        return { ...prev, [agentId]: { ...current, ...patch } };
      });
    };

    const apply = (event: HermesEvent) => {
      switch (event.type) {
        case 'snapshot':
          setAgents(Object.fromEntries(event.agents.map((a) => [a.id, a])));
          setMessages(event.messages.slice(-MAX_MESSAGES));
          break;
        case 'agent_status':
          patchAgent(event.agentId, {
            status: event.status,
            ...(event.currentTask !== undefined ? { currentTask: event.currentTask } : {}),
            updatedAt: event.ts,
          });
          break;
        case 'task_started':
          patchAgent(event.agentId, { status: 'working', currentTask: event.title, updatedAt: event.ts });
          break;
        case 'task_completed':
          patchAgent(event.agentId, { status: 'idle', currentTask: null, updatedAt: event.ts });
          break;
        case 'token_usage':
          patchAgent(event.agentId, { tokensUsed: event.tokensUsed, costUsd: event.costUsd, updatedAt: event.ts });
          break;
        case 'error':
          patchAgent(event.agentId, { status: 'error', updatedAt: event.ts });
          break;
        case 'message':
          setMessages((prev) => [
            ...prev.slice(-(MAX_MESSAGES - 1)),
            { from: event.from, to: event.to, text: event.text, ts: event.ts },
          ]);
          break;
      }
    };

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(url);
      ws.onopen = () => {
        retries = 0;
        setConnected(true);
      };
      ws.onclose = () => {
        setConnected(false);
        if (!disposed) {
          const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** retries);
          retries += 1;
          timer = window.setTimeout(connect, delay);
        }
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (e) => {
        try {
          apply(JSON.parse(e.data as string) as HermesEvent);
        } catch {
          // Malformed frame — ignore rather than crash the dashboard
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return { connected, agents, messages };
}

/**
 * Aggregates recent messages into communication-graph edges. Pure function so
 * the render loop can call it every frame and tests can exercise it directly.
 */
export function deriveFlows(messages: AgentMessage[], now: number): CommunicationFlow[] {
  const edges = new Map<string, CommunicationFlow>();
  for (const m of messages) {
    const age = now - m.ts;
    if (age > FLOW_WINDOW_MS) continue;
    const key = `${m.from}->${m.to}`;
    const edge = edges.get(key) ?? { from: m.from, to: m.to, active: false, messageCount: 0 };
    edge.messageCount += 1;
    if (age < FLOW_ACTIVE_MS) edge.active = true;
    edges.set(key, edge);
  }
  return [...edges.values()];
}
