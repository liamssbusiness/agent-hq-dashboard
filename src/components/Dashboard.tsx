import React, { useEffect, useRef, useState } from 'react';
import type { AgentMessage, AgentState, CommunicationFlow } from '../types/events';
import { deriveFlows, useHermes } from '../hooks/useHermes';
import OpsPanel from './OpsPanel';
import {
  PX,
  RAIL_W,
  THEMES,
  computeScene,
  drawCorridor,
  drawDesk,
  drawMonitorBezel,
  drawRails,
  drawRoomShell,
  drawScanlines,
  drawScreenGlass,
  drawSprite,
  drawStarfield,
  drawTicker,
  drawWall,
  type ScreenRect,
} from '../render/pixel';

interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  status: 'idle' | 'working' | 'error';
}

// Station grid: 3 columns, cell 300x250 with 64px structural gaps.
const CW = 300;
const CH = 250;
const GAP = 48;
const OX = 24;
const OY = 24;
const cell = (col: number, row: number) => ({ x: OX + col * (CW + GAP), y: OY + row * (CH + GAP) });

const ROOMS: Room[] = [
  { id: 'code', name: 'Code Lab', ...cell(0, 0), width: CW, height: CH, color: '#00ff41', status: 'working' },
  { id: 'learning', name: 'Learning Room', ...cell(1, 0), width: CW, height: CH, color: '#00ff41', status: 'idle' },
  { id: 'ads', name: 'Ads Studio', ...cell(2, 0), width: CW, height: CH, color: '#ff006e', status: 'working' },
  { id: 'trading', name: 'Trading Desk', ...cell(0, 1), width: CW, height: CH, color: '#ffa500', status: 'idle' },
  { id: 'hub', name: 'Central Hub', ...cell(1, 1), width: CW, height: CH, color: '#00d4ff', status: 'idle' },
  { id: 'revify', name: 'Revify HQ', ...cell(2, 1), width: CW, height: CH, color: '#0066ff', status: 'working' },
  { id: 'social', name: 'Social Chamber', ...cell(1, 2), width: CW, height: CH, color: '#8B5CF6', status: 'idle' },
];

// Corridor segments between adjacent rooms (door-to-door)
const CORRIDORS: Array<[string, string]> = [
  ['code', 'learning'],
  ['learning', 'ads'],
  ['trading', 'hub'],
  ['hub', 'revify'],
  ['code', 'trading'],
  ['learning', 'hub'],
  ['ads', 'revify'],
  ['hub', 'social'],
];

const WORLD_W = OX * 2 + 3 * CW + 2 * GAP;
const WORLD_H = OY * 2 + 3 * CH + 2 * GAP;

// Fallback data shown when the Hermes daemon is offline
const MOCK_FLOWS: CommunicationFlow[] = [
  { from: 'ads', to: 'hub', active: true, messageCount: 5 },
  { from: 'hub', to: 'revify', active: true, messageCount: 3 },
  { from: 'revify', to: 'ads', active: true, messageCount: 2 },
  { from: 'code', to: 'hub', active: false, messageCount: 1 },
  { from: 'trading', to: 'hub', active: true, messageCount: 4 },
];

const MOCK_MESSAGES: AgentMessage[] = [
  { from: 'ads', to: 'hub', text: 'Campaign performance: 50 leads', ts: Date.now() - 5000 },
  { from: 'hub', to: 'revify', text: 'Alchemy metrics updated', ts: Date.now() - 3000 },
  { from: 'revify', to: 'ads', text: 'Scale to $10K budget', ts: Date.now() - 1000 },
];

const MOCK_TICKER =
  'AGENT HQ ONLINE +++ MOCK MODE — START THE HERMES DAEMON FOR LIVE FEED (cd hermes && npm run demo) +++ 7 ROOMS OPERATIONAL +++ MEMORY SYSTEM STANDING BY';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;

const Dashboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const { connected, agents, messages, tasks, paused } = useHermes();

  // Mutable refs so the render loop always sees current values without re-subscribing
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const liveRef = useRef<{ connected: boolean; agents: Record<string, AgentState>; messages: AgentMessage[] }>({
    connected: false,
    agents: {},
    messages: [],
  });
  const selectedRef = useRef<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);
  const fittedRef = useRef(false);
  const screenRef = useRef<ScreenRect>({ x: 0, y: 0, w: 0, h: 0 });

  viewRef.current = { zoom, pan };
  liveRef.current = { connected, agents, messages };
  selectedRef.current = selectedRoom;

  const statusOf = (roomId: string, live: typeof liveRef.current): Room['status'] => {
    if (live.connected) {
      const s = live.agents[roomId]?.status;
      if (s === 'working' || s === 'error') return s;
      return 'idle';
    }
    return ROOMS.find((r) => r.id === roomId)!.status;
  };

  // Continuous render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      // Fit the whole station inside the CRT screen (minus rails + ticker)
      if (!fittedRef.current && canvas.offsetWidth > 0) {
        fittedRef.current = true;
        const { screen } = computeScene(canvas.offsetWidth, canvas.offsetHeight);
        const fitX = screen.x + RAIL_W + 6;
        const fitY = screen.y + 24;
        const fitW = screen.w - RAIL_W * 2 - 12;
        const fitH = screen.h - 28;
        const z = Math.min(fitW / WORLD_W, fitH / WORLD_H) * 0.99;
        const fitted = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
        setZoom(fitted);
        setPan({
          x: fitX + (fitW - WORLD_W * fitted) / 2,
          y: fitY + (fitH - WORLD_H * fitted) / 2,
        });
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const t = Date.now();
      const { zoom: z, pan: p } = viewRef.current;
      const live = liveRef.current;
      const flows = live.connected ? deriveFlows(live.messages, t) : MOCK_FLOWS;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Physical scene: wall, desk, monitor chrome
      const { screen, deskTop, bezel } = computeScene(width, height);
      screenRef.current = screen;
      drawWall(ctx, width, height, t);
      drawDesk(ctx, width, height, deskTop, bezel);
      drawMonitorBezel(ctx, bezel, screen, t);

      // Everything below renders inside the CRT screen
      ctx.save();
      ctx.beginPath();
      ctx.rect(screen.x, screen.y, screen.w, screen.h);
      ctx.clip();

      drawStarfield(ctx, screen.x, screen.y, screen.w, screen.h, t);

      // World space
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(z, z);

      // Station corridors behind the rooms
      for (const [a, b] of CORRIDORS) {
        const ra = ROOMS.find((r) => r.id === a)!;
        const rb = ROOMS.find((r) => r.id === b)!;
        drawCorridor(
          ctx,
          ra.x + ra.width / 2 + (rb.x > ra.x ? ra.width / 2 : rb.x < ra.x ? -ra.width / 2 : 0),
          ra.y + ra.height / 2 + (rb.y > ra.y ? ra.height / 2 : rb.y < ra.y ? -ra.height / 2 : 0),
          rb.x + rb.width / 2 + (ra.x > rb.x ? rb.width / 2 : ra.x < rb.x ? -rb.width / 2 : 0),
          rb.y + rb.height / 2 + (ra.y > rb.y ? rb.height / 2 : ra.y < rb.y ? -rb.height / 2 : 0),
        );
      }

      // Rooms: shell, themed props, agent sprite
      ROOMS.forEach((room, i) => {
        const status = statusOf(room.id, live);
        const theme = THEMES[room.id];
        drawRoomShell(ctx, room.x, room.y, room.width, room.height, theme, room.name, status, t, selectedRef.current === room.id);
        theme.props(ctx, room.x, room.y + PX * 7, room.width, room.height - PX * 7, t);
        drawSprite(ctx, room.x + room.width / 2, room.y + room.height - PX * 16, theme.base, t, status, i + 1);
      });

      // Active communication packets over the corridors
      flows.forEach((flow) => {
        if (!flow.active) return;
        const a = ROOMS.find((r) => r.id === flow.from);
        const b = ROOMS.find((r) => r.id === flow.to);
        if (!a || !b) return;
        const x1 = a.x + a.width / 2;
        const y1 = a.y + a.height / 2;
        const x2 = b.x + b.width / 2;
        const y2 = b.y + b.height / 2;
        ctx.strokeStyle = 'rgba(0, 255, 65, 0.14)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const tt = (t % 1600) / 1600;
        ctx.fillStyle = 'rgba(0, 255, 65, 0.95)';
        ctx.fillRect(x1 + (x2 - x1) * tt - 2, y1 + (y2 - y1) * tt - 2, 5, 5);
      });

      ctx.restore();

      // In-screen chrome: ticker, instrument rails, scanlines, glass
      const tickerText = live.connected
        ? live.messages
            .slice(-6)
            .map((m) => `${nameOf(m.from)} → ${nameOf(m.to)}: ${m.text}`)
            .join('  +++  ') || 'HERMES ONLINE — AWAITING TRAFFIC'
        : MOCK_TICKER;
      drawTicker(ctx, screen.x + RAIL_W, screen.y, screen.w - RAIL_W * 2, tickerText.toUpperCase(), t);

      const railAgents = ROOMS.map((r) => {
        const a = live.connected ? live.agents[r.id] : undefined;
        return {
          id: r.id,
          color: r.color,
          frac: a ? Math.min(1, a.tokensUsed / Math.max(1, a.tokenBudget)) : 0.15 + 0.5 * ((r.id.length * 37) % 10) / 10,
          working: statusOf(r.id, live) === 'working',
        };
      });
      const totalCost = live.connected
        ? Object.values(live.agents).reduce((s, a) => s + a.costUsd, 0)
        : 1.42;
      const msgs = live.connected ? live.messages.length : MOCK_MESSAGES.length;
      drawRails(ctx, screen, railAgents, t, { msgs, cost: totalCost });

      drawScanlines(ctx, screen.x, screen.y, screen.w, screen.h);
      drawScreenGlass(ctx, screen);
      ctx.restore(); // screen clip

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Wheel zoom via native listener (React's onWheel is passive — preventDefault is ignored)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { zoom: z, pan: p } = viewRef.current;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
      const scale = next / z;
      setPan({ x: mx - (mx - p.x) * scale, y: my - (my - p.y) * scale });
      setZoom(next);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const nameOf = (id: string) => ROOMS.find((r) => r.id === id)?.name ?? id;

  const toWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { zoom: z, pan: p } = viewRef.current;
    return {
      x: (clientX - rect.left - p.x) / z,
      y: (clientY - rect.top - p.y) / z,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: viewRef.current.pan.x,
      panY: viewRef.current.pan.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) setPan({ x: drag.panX + dx, y: drag.panY + dy });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) return; // it was a pan, not a click

    const { x, y } = toWorld(e.clientX, e.clientY);
    const hit = ROOMS.find(
      (room) => x >= room.x && x <= room.x + room.width && y >= room.y && y <= room.y + room.height
    );
    setSelectedRoom(hit ? (selectedRef.current === hit.id ? null : hit.id) : null);
  };

  const selected = selectedRoom ? ROOMS.find((r) => r.id === selectedRoom) : null;
  const selectedLive: AgentState | undefined = selected && connected ? agents[selected.id] : undefined;
  const activeFlowCount = connected
    ? deriveFlows(messages, Date.now()).filter((f) => f.active).length
    : MOCK_FLOWS.filter((f) => f.active).length;

  return (
    <div className="w-full h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="bg-black/70 border-b border-cyan-500/20 px-4 py-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cyan-400 font-mono tracking-widest">AGENT HQ</h1>
          <p className="text-cyan-300/50 text-xs font-mono">MULTI-AGENT STATION — LIVE OPS</p>
        </div>
        <span
          className={
            connected && paused
              ? 'text-red-400 text-sm font-mono border border-red-400/50 rounded px-3 py-1'
              : connected
                ? 'text-green-400 text-sm font-mono border border-green-400/50 rounded px-3 py-1'
                : 'text-orange-400 text-sm font-mono border border-orange-400/50 rounded px-3 py-1'
          }
        >
          {connected ? (paused ? '■ PAUSED' : '● LIVE') : '○ MOCK'}
        </span>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        />

        {/* Info Panel */}
        {selected && (
          <div className="absolute bottom-6 left-6 bg-black/85 border-2 border-green-400 p-4 rounded max-w-xs font-mono">
            <h3 className="text-green-400 font-bold mb-2">{selected.name}</h3>
            <div className="text-green-300 text-sm space-y-1">
              <p>
                Status:{' '}
                <span className="text-white">{selectedLive ? selectedLive.status : selected.status}</span>
              </p>
              {selectedLive?.currentTask && (
                <p>
                  Task: <span className="text-white">{selectedLive.currentTask}</span>
                </p>
              )}
              <p>
                Tasks queued: <span className="text-white">{selectedLive ? selectedLive.tasksQueued : 3}</span>
              </p>
              <p>
                Tokens:{' '}
                <span className="text-white">
                  {selectedLive
                    ? `${selectedLive.tokensUsed.toLocaleString()} / ${selectedLive.tokenBudget.toLocaleString()}`
                    : '42,150 / 128,000'}
                </span>
              </p>
              <p>
                Cost:{' '}
                <span className="text-white">${selectedLive ? selectedLive.costUsd.toFixed(2) : '0.52'}</span>
              </p>
            </div>
          </div>
        )}

        {/* Operations panel (live mode only) */}
        {connected && <OpsPanel agents={agents} tasks={tasks} messages={messages} paused={paused} />}

      </div>

      {/* Footer */}
      <div className="bg-black/70 border-t border-cyan-500/20 px-4 py-2 text-xs text-cyan-300/60 font-mono">
        <span>
          {ROOMS.length} AGENTS • {activeFlowCount} ACTIVE FLOWS • 🖱️ CLICK ROOM · ✋ DRAG · 🔍 SCROLL •{' '}
          {connected ? 'LIVE VIA HERMES DAEMON (hermes/)' : 'MOCK DATA — START: cd hermes && npm run demo'}
        </span>
      </div>
    </div>
  );
};

export default Dashboard;
