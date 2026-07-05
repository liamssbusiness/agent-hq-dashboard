// Shared event schema between the Hermes daemon and the dashboard.
// The daemon (hermes/) emits these over WebSocket; the dashboard consumes them.
// Keep in sync with hermes/server.js — this file is the source of truth.

export type AgentStatus = 'idle' | 'working' | 'error' | 'offline';

export interface AgentState {
  id: string;
  name: string;
  status: AgentStatus;
  currentTask: string | null;
  tasksQueued: number;
  tokensUsed: number;
  tokenBudget: number;
  costUsd: number;
  updatedAt: number;
}

export interface AgentMessage {
  from: string; // agent id
  to: string; // agent id
  text: string;
  ts: number;
}

export type HermesEvent =
  | { type: 'snapshot'; agents: AgentState[]; messages: AgentMessage[]; ts: number }
  | { type: 'agent_status'; agentId: string; status: AgentStatus; currentTask?: string | null; ts: number }
  | { type: 'task_started'; agentId: string; taskId: string; title: string; ts: number }
  | { type: 'task_completed'; agentId: string; taskId: string; ok: boolean; summary?: string; ts: number }
  | { type: 'message'; from: string; to: string; text: string; ts: number }
  | { type: 'error'; agentId: string; message: string; ts: number }
  | { type: 'token_usage'; agentId: string; tokensUsed: number; costUsd: number; ts: number };

// Dashboard view model: an aggregated edge in the communication graph,
// derived from recent `message` events.
export interface CommunicationFlow {
  from: string; // agent id
  to: string; // agent id
  active: boolean;
  messageCount: number;
}

export const HERMES_DEFAULT_URL = 'ws://localhost:4870';

