import React, { useEffect, useRef, useState } from 'react';

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

interface Message {
  from: string;
  to: string;
  text: string;
  timestamp: number;
}

interface CommunicationFlow {
  from: string;
  to: string;
  active: boolean;
  messageCount: number;
}

const ROOMS: Room[] = [
  { id: 'hub', name: 'Central Hub', x: 300, y: 300, width: 120, height: 100, color: '#00d4ff', status: 'idle' },
  { id: 'code', name: 'Code Lab', x: 100, y: 100, width: 120, height: 100, color: '#00ff41', status: 'working' },
  { id: 'ads', name: 'Ads Studio', x: 500, y: 100, width: 120, height: 100, color: '#ff006e', status: 'working' },
  { id: 'trading', name: 'Trading Desk', x: 100, y: 500, width: 120, height: 100, color: '#ffa500', status: 'idle' },
  { id: 'social', name: 'Social Chamber', x: 500, y: 500, width: 120, height: 100, color: '#8B5CF6', status: 'idle' },
  { id: 'revify', name: 'Revify HQ', x: 700, y: 300, width: 120, height: 100, color: '#0066ff', status: 'working' },
  { id: 'learning', name: 'Learning Room', x: 300, y: 700, width: 120, height: 100, color: '#00ff41', status: 'idle' },
];

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

const Dashboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [communicationFlows, setCommunicationFlows] = useState<CommunicationFlow[]>([]);

  // Mutable refs so the render loop always sees current values without re-subscribing
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const flowsRef = useRef<CommunicationFlow[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const selectedRef = useRef<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null);

  viewRef.current = { zoom, pan };
  flowsRef.current = communicationFlows;
  messagesRef.current = messages;
  selectedRef.current = selectedRoom;

  // Simulated agent communication (replaced by the Hermes WebSocket feed later —
  // see docs/AGENTIC-WORKFLOW-PLAN.md)
  useEffect(() => {
    setCommunicationFlows([
      { from: 'ads', to: 'hub', active: true, messageCount: 5 },
      { from: 'hub', to: 'revify', active: true, messageCount: 3 },
      { from: 'revify', to: 'ads', active: true, messageCount: 2 },
      { from: 'code', to: 'hub', active: false, messageCount: 1 },
      { from: 'trading', to: 'hub', active: true, messageCount: 4 },
    ]);

    setMessages([
      { from: 'Ads Studio', to: 'Central Hub', text: 'Campaign performance: 50 leads', timestamp: Date.now() - 5000 },
      { from: 'Central Hub', to: 'Revify HQ', text: 'Alchemy metrics updated', timestamp: Date.now() - 3000 },
      { from: 'Revify HQ', to: 'Ads Studio', text: 'Scale to $10K budget', timestamp: Date.now() - 1000 },
    ]);
  }, []);

  // Continuous render loop — keeps pulse animations alive and reflects zoom/pan
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
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const { zoom: z, pan: p } = viewRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);

      // World space: pan + zoom applied to the map, not the HUD
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(z, z);

      drawGrid(ctx, width / z + Math.abs(p.x / z), height / z + Math.abs(p.y / z));
      drawHallways(ctx);
      drawCommunicationFlows(ctx, flowsRef.current);
      drawRooms(ctx, selectedRef.current);
      drawLabels(ctx);
      ctx.restore();

      // Screen space HUD
      drawStatsPanel(ctx, z, flowsRef.current, messagesRef.current);

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
      // Zoom toward the cursor: keep the world point under the mouse fixed
      const scale = next / z;
      setPan({ x: mx - (mx - p.x) * scale, y: my - (my - p.y) * scale });
      setZoom(next);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

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

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.lineWidth = 1;

    const gridSize = 50;
    const maxX = Math.max(width, 1200);
    const maxY = Math.max(height, 1200);
    for (let x = 0; x < maxX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, maxY);
      ctx.stroke();
    }
    for (let y = 0; y < maxY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(maxX, y);
      ctx.stroke();
    }
  };

  const drawHallways = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
    ctx.lineWidth = 3;

    const hub = ROOMS.find((r) => r.id === 'hub')!;
    ROOMS.forEach((room) => {
      if (room.id !== 'hub') {
        ctx.beginPath();
        ctx.moveTo(hub.x + hub.width / 2, hub.y + hub.height / 2);
        ctx.lineTo(room.x + room.width / 2, room.y + room.height / 2);
        ctx.stroke();
      }
    });
  };

  const drawCommunicationFlows = (ctx: CanvasRenderingContext2D, flows: CommunicationFlow[]) => {
    flows.forEach((flow) => {
      const fromRoom = ROOMS.find((r) => r.id === flow.from);
      const toRoom = ROOMS.find((r) => r.id === flow.to);
      if (!fromRoom || !toRoom || !flow.active) return;

      const startX = fromRoom.x + fromRoom.width / 2;
      const startY = fromRoom.y + fromRoom.height / 2;
      const endX = toRoom.x + toRoom.width / 2;
      const endY = toRoom.y + toRoom.height / 2;

      const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      gradient.addColorStop(0, 'rgba(0, 255, 65, 0.5)');
      gradient.addColorStop(1, 'rgba(0, 255, 65, 0.1)');

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      drawArrow(ctx, startX, startY, endX, endY, '#00ff41');

      // Animated pulse traveling along the flow
      const t = (Date.now() % 2000) / 2000;
      const px = startX + (endX - startX) * t;
      const py = startY + (endY - startY) * t;
      ctx.fillStyle = 'rgba(0, 255, 65, 0.9)';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();

      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      ctx.fillStyle = '#00ff41';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${flow.messageCount}`, midX, midY - 10);
    });
  };

  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: string
  ) => {
    const headlen = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  };

  const drawRooms = (ctx: CanvasRenderingContext2D, selected: string | null) => {
    ROOMS.forEach((room) => {
      ctx.fillStyle = room.color;
      ctx.globalAlpha = 0.1;
      ctx.fillRect(room.x, room.y, room.width, room.height);

      ctx.globalAlpha = room.status === 'working' ? 0.8 : 0.4;
      ctx.strokeStyle = room.color;
      ctx.lineWidth = 2 + Math.sin(Date.now() / 500) * 2;
      ctx.strokeRect(room.x, room.y, room.width, room.height);

      if (selected === room.id) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(room.x - 5, room.y - 5, room.width + 10, room.height + 10);
      }

      ctx.globalAlpha = 1;
      const statusColor = room.status === 'error' ? '#ff0000' : room.status === 'working' ? '#00ff41' : '#666666';
      ctx.fillStyle = statusColor;
      ctx.beginPath();
      ctx.arc(room.x + room.width - 10, room.y + 10, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const drawLabels = (ctx: CanvasRenderingContext2D) => {
    ROOMS.forEach((room) => {
      ctx.fillStyle = room.color;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1;
      ctx.fillText(room.name, room.x + room.width / 2, room.y + room.height / 2);
    });
  };

  const drawStatsPanel = (
    ctx: CanvasRenderingContext2D,
    z: number,
    flows: CommunicationFlow[],
    msgs: Message[]
  ) => {
    const panelWidth = 250;
    const panelHeight = 120;
    const panelX = 20;

    ctx.fillStyle = 'rgba(0, 20, 40, 0.95)';
    ctx.fillRect(panelX, 20, panelWidth, panelHeight);

    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, 20, panelWidth, panelHeight);

    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const working = ROOMS.filter((r) => r.status === 'working').length;
    let y = 45;
    const lineHeight = 20;
    const textX = panelX + 15;

    ctx.fillText(`Active Agents: ${working}/${ROOMS.length}`, textX, y);
    y += lineHeight;
    ctx.fillText(`Messages: ${msgs.length}`, textX, y);
    y += lineHeight;
    ctx.fillText(`Flows: ${flows.filter((f) => f.active).length}`, textX, y);
    y += lineHeight;
    ctx.fillText(`Zoom: ${(z * 100).toFixed(0)}%`, textX, y);
  };

  const selected = selectedRoom ? ROOMS.find((r) => r.id === selectedRoom) : null;

  return (
    <div className="w-full h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-black/50 border-b border-cyan-500/20 p-4">
        <h1 className="text-2xl font-bold text-cyan-400">Agent HQ — Multi-Agent Dashboard</h1>
        <p className="text-cyan-300/60 text-sm">Real-time Agent Communication Network</p>
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
          <div className="absolute bottom-6 left-6 bg-black/80 border-2 border-green-400 p-4 rounded max-w-xs">
            <h3 className="text-green-400 font-bold mb-2">{selected.name}</h3>
            <div className="text-green-300 text-sm space-y-1">
              <p>
                Status: <span className="text-white">{selected.status}</span>
              </p>
              <p>
                Tasks: <span className="text-white">3 queued</span>
              </p>
              <p>
                Tokens: <span className="text-white">42,150 / 128,000</span>
              </p>
              <p>
                Cost: <span className="text-white">$0.52</span>
              </p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute top-6 right-6 bg-black/80 border-2 border-pink-500/50 p-3 rounded space-y-2 text-sm text-pink-300 pointer-events-none">
          <p>🖱️ Click rooms for details</p>
          <p>✋ Drag to pan</p>
          <p>🔍 Scroll to zoom</p>
          <p>Zoom: {(zoom * 100).toFixed(0)}%</p>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-black/50 border-t border-cyan-500/20 p-3 text-xs text-cyan-300/60">
        <span>
          {ROOMS.length} Agents • {communicationFlows.filter((f) => f.active).length} Active Flows • Mock data — see
          docs/AGENTIC-WORKFLOW-PLAN.md
        </span>
      </div>
    </div>
  );
};

export default Dashboard;
