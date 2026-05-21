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

const Dashboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [communicationFlows, setCommunicationFlows] = useState<CommunicationFlow[]>([]);

  // Define rooms
  const rooms: Room[] = [
    { id: 'hub', name: 'Central Hub', x: 300, y: 300, width: 120, height: 100, color: '#00d4ff', status: 'idle' },
    { id: 'code', name: 'Code Lab', x: 100, y: 100, width: 120, height: 100, color: '#00ff41', status: 'working' },
    { id: 'ads', name: 'Ads Studio', x: 500, y: 100, width: 120, height: 100, color: '#ff006e', status: 'working' },
    { id: 'trading', name: 'Trading Desk', x: 100, y: 500, width: 120, height: 100, color: '#ffa500', status: 'idle' },
    { id: 'social', name: 'Social Chamber', x: 500, y: 500, width: 120, height: 100, color: '#8B5CF6', status: 'idle' },
    { id: 'revify', name: 'Revify HQ', x: 700, y: 300, width: 120, height: 100, color: '#0066ff', status: 'working' },
    { id: 'learning', name: 'Learning Room', x: 300, y: 700, width: 120, height: 100, color: '#00ff41', status: 'idle' },
  ];

  // Simulate agent communication
  useEffect(() => {
    const flows: CommunicationFlow[] = [
      { from: 'ads', to: 'hub', active: true, messageCount: 5 },
      { from: 'hub', to: 'revify', active: true, messageCount: 3 },
      { from: 'revify', to: 'ads', active: true, messageCount: 2 },
      { from: 'code', to: 'hub', active: false, messageCount: 1 },
      { from: 'trading', to: 'hub', active: true, messageCount: 4 },
    ];
    setCommunicationFlows(flows);

    // Simulate messages
    const newMessages: Message[] = [
      { from: 'Ads Studio', to: 'Central Hub', text: 'Campaign performance: 50 leads', timestamp: Date.now() - 5000 },
      { from: 'Central Hub', to: 'Revify HQ', text: 'Alchemy metrics updated', timestamp: Date.now() - 3000 },
      { from: 'Revify HQ', to: 'Ads Studio', text: 'Scale to $10K budget', timestamp: Date.now() - 1000 },
    ];
    setMessages(newMessages);
  }, []);

  // Draw dashboard
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid(ctx, canvas.width, canvas.height);

    // Draw hallways (connections between rooms)
    drawHallways(ctx, rooms);

    // Draw communication flows (animated arrows)
    drawCommunicationFlows(ctx, rooms, communicationFlows);

    // Draw rooms
    drawRooms(ctx, rooms, selectedRoom);

    // Draw labels
    drawLabels(ctx, rooms);

    // Draw stats panel
    drawStatsPanel(ctx, canvas.width, canvas.height);
  }, [zoom, pan, selectedRoom, communicationFlows]);

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.lineWidth = 1;

    const gridSize = 50;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  };

  const drawHallways = (ctx: CanvasRenderingContext2D, rooms: Room[]) => {
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
    ctx.lineWidth = 3;

    // Connect all rooms to hub
    const hub = rooms.find(r => r.id === 'hub')!;
    rooms.forEach(room => {
      if (room.id !== 'hub') {
        ctx.beginPath();
        ctx.moveTo(hub.x + hub.width / 2, hub.y + hub.height / 2);
        ctx.lineTo(room.x + room.width / 2, room.y + room.height / 2);
        ctx.stroke();
      }
    });
  };

  const drawCommunicationFlows = (ctx: CanvasRenderingContext2D, rooms: Room[], flows: CommunicationFlow[]) => {
    flows.forEach(flow => {
      const fromRoom = rooms.find(r => r.id === flow.from);
      const toRoom = rooms.find(r => r.id === flow.to);

      if (!fromRoom || !toRoom) return;

      const startX = fromRoom.x + fromRoom.width / 2;
      const startY = fromRoom.y + fromRoom.height / 2;
      const endX = toRoom.x + toRoom.width / 2;
      const endY = toRoom.y + toRoom.height / 2;

      if (flow.active) {
        // Draw animated flow
        const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
        gradient.addColorStop(0, 'rgba(0, 255, 65, 0.5)');
        gradient.addColorStop(1, 'rgba(0, 255, 65, 0.1)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Draw arrow
        drawArrow(ctx, startX, startY, endX, endY, '#00ff41');

        // Draw message count
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        ctx.fillStyle = '#00ff41';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${flow.messageCount}`, midX, midY - 10);
      }
    });
  };

  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string) => {
    const headlen = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  };

  const drawRooms = (ctx: CanvasRenderingContext2D, rooms: Room[], selected: string | null) => {
    rooms.forEach(room => {
      // Draw room background
      ctx.fillStyle = room.color;
      ctx.globalAlpha = 0.1;
      ctx.fillRect(room.x, room.y, room.width, room.height);

      // Draw room border with glow
      ctx.globalAlpha = 1;
      const pulseIntensity = room.status === 'working' ? 0.8 : 0.4;
      ctx.strokeStyle = room.color;
      ctx.globalAlpha = pulseIntensity;
      ctx.lineWidth = 2 + Math.sin(Date.now() / 500) * 2;
      ctx.strokeRect(room.x, room.y, room.width, room.height);

      // Highlight selected room
      if (selected === room.id) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(room.x - 5, room.y - 5, room.width + 10, room.height + 10);
      }

      // Draw status indicator
      ctx.globalAlpha = 1;
      const statusColor = room.status === 'error' ? '#ff0000' : room.status === 'working' ? '#00ff41' : '#666666';
      ctx.fillStyle = statusColor;
      ctx.beginPath();
      ctx.arc(room.x + room.width - 10, room.y + 10, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const drawLabels = (ctx: CanvasRenderingContext2D, rooms: Room[]) => {
    rooms.forEach(room => {
      ctx.fillStyle = room.color;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1;
      ctx.fillText(room.name, room.x + room.width / 2, room.y + room.height / 2);
    });
  };

  const drawStatsPanel = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const panelWidth = 250;
    const panelHeight = 120;

    // Panel background
    ctx.fillStyle = 'rgba(0, 20, 40, 0.95)';
    ctx.fillRect(width - panelWidth - 20, 20, panelWidth, panelHeight);

    // Panel border
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(width - panelWidth - 20, 20, panelWidth, panelHeight);

    // Text
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';

    let y = 40;
    const lineHeight = 20;

    ctx.fillText('Active Agents: 4/7', width - panelWidth, y);
    y += lineHeight;
    ctx.fillText('Messages: ' + messages.length, width - panelWidth, y);
    y += lineHeight;
    ctx.fillText('Flows: ' + communicationFlows.filter(f => f.active).length, width - panelWidth, y);
    y += lineHeight;
    ctx.fillText(`Zoom: ${(zoom * 100).toFixed(0)}%`, width - panelWidth, y);
  };

  // Canvas click handler
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check which room was clicked
    rooms.forEach(room => {
      if (x >= room.x && x <= room.x + room.width && y >= room.y && y <= room.y + room.height) {
        setSelectedRoom(selectedRoom === room.id ? null : room.id);
      }
    });
  };

  // Zoom with scroll
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(Math.max(0.5, Math.min(3, zoom * delta)));
  };

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
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          className="w-full h-full cursor-crosshair"
        />

        {/* Info Panel */}
        {selectedRoom && (
          <div className="absolute bottom-6 left-6 bg-black/80 border-2 border-green-400 p-4 rounded max-w-xs">
            <h3 className="text-green-400 font-bold mb-2">{rooms.find(r => r.id === selectedRoom)?.name}</h3>
            <div className="text-green-300 text-sm space-y-1">
              <p>Status: <span className="text-white">{rooms.find(r => r.id === selectedRoom)?.status}</span></p>
              <p>Tasks: <span className="text-white">3 queued</span></p>
              <p>Tokens: <span className="text-white">42,150 / 128,000</span></p>
              <p>Cost: <span className="text-white">$0.52</span></p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute top-6 right-6 bg-black/80 border-2 border-magenta-500/50 p-3 rounded space-y-2 text-sm text-magenta-300">
          <p>🖱️ Click rooms for details</p>
          <p>🔍 Scroll to zoom</p>
          <p>Zoom: {(zoom * 100).toFixed(0)}%</p>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-black/50 border-t border-cyan-500/20 p-3 text-xs text-cyan-300/60">
        <span>7 Agents • 5 Active Flows • Last update: Just now</span>
      </div>
    </div>
  );
};

export default Dashboard;
