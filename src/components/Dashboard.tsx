import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';

interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  status: 'idle' | 'working' | 'error';
  taskCount: number;
}

const AgentHQDashboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const mainContainerRef = useRef<PIXI.Container | null>(null);

  const rooms: Room[] = [
    { id: 'hub', name: 'Central Hub', x: 400, y: 300, width: 120, height: 120, color: 0x00d4ff, status: 'working', taskCount: 12 },
    { id: 'code', name: 'Code Lab', x: 200, y: 150, width: 100, height: 100, color: 0x00ff41, status: 'idle', taskCount: 0 },
    { id: 'ads', name: 'Ads Studio', x: 600, y: 150, width: 100, height: 100, color: 0xff006e, status: 'working', taskCount: 3 },
    { id: 'trading', name: 'Trading Desk', x: 200, y: 450, width: 100, height: 100, color: 0xffa500, status: 'working', taskCount: 4 },
    { id: 'social', name: 'Social Chamber', x: 600, y: 450, width: 100, height: 100, color: 0x8B5CF6, status: 'working', taskCount: 2 },
    { id: 'revify', name: 'Revify HQ', x: 400, y: 450, width: 100, height: 100, color: 0x3B82F6, status: 'working', taskCount: 2 },
    { id: 'learning', name: 'Learning Room', x: 400, y: 50, width: 100, height: 100, color: 0x00ff41, status: 'idle', taskCount: 1 },
  ];

  useEffect(() => {
    if (!canvasRef.current) return;

    const pixiApp = new PIXI.Application({
      canvas: canvasRef.current,
      width: 1000,
      height: 700,
      backgroundColor: 0x0a0a0a,
      antialias: true,
    });

    pixiAppRef.current = pixiApp;

    const mainContainer = new PIXI.Container();
    mainContainerRef.current = mainContainer;
    pixiApp.stage.addChild(mainContainer);

    // Draw hallways
    const hallwayGraphics = new PIXI.Graphics();
    hallwayGraphics.lineStyle({ width: 2, color: 0x00d4ff, alpha: 0.2 });

    const hubX = 460;
    const hubY = 360;

    rooms.slice(1).forEach((room) => {
      hallwayGraphics.moveTo(hubX, hubY);
      hallwayGraphics.lineTo(room.x + room.width / 2, room.y + room.height / 2);
    });

    mainContainer.addChild(hallwayGraphics);

    // Draw rooms
    rooms.forEach((room) => {
      const roomGraphics = new PIXI.Graphics();

      // Glow effect
      if (room.status === 'working') {
        const glowGraphics = new PIXI.Graphics();
        glowGraphics.lineStyle({ width: 3, color: room.color, alpha: 0.4 });
        glowGraphics.drawRect(room.x - 8, room.y - 8, room.width + 16, room.height + 16);
        mainContainer.addChild(glowGraphics);

        // Animate glow
        pixiApp.ticker.add(() => {
          glowGraphics.alpha = 0.2 + Math.sin(Date.now() / 500) * 0.2;
        });
      }

      // Room border
      roomGraphics.lineStyle({ width: room.status === 'working' ? 3 : 1, color: room.color, alpha: 1 });
      roomGraphics.beginFill(room.color, 0.08);
      roomGraphics.drawRect(room.x, room.y, room.width, room.height);
      roomGraphics.endFill();

      // Room name
      const text = new PIXI.Text(room.name, {
        fontSize: 13,
        fontFamily: 'monospace',
        fill: room.color,
      });
      text.x = room.x + room.width / 2 - text.width / 2;
      text.y = room.y + room.height / 2 - 15;
      roomGraphics.addChild(text);

      // Task count badge
      if (room.taskCount > 0) {
        const badge = new PIXI.Text(`${room.taskCount}`, {
          fontSize: 11,
          fontFamily: 'monospace',
          fill: 0xff006e,
          fontWeight: 'bold',
        });
        badge.x = room.x + room.width - 20;
        badge.y = room.y + 5;
        roomGraphics.addChild(badge);
      }

      // Status indicator
      const statusText = new PIXI.Text(room.status === 'working' ? '●' : '○', {
        fontSize: 16,
        fill: room.status === 'working' ? 0x00ff41 : 0x666666,
      });
      statusText.x = room.x + 8;
      statusText.y = room.y + room.height - 20;
      roomGraphics.addChild(statusText);

      roomGraphics.interactive = true;
      roomGraphics.buttonMode = true;
      roomGraphics.on('click', () => setSelectedRoom(room));

      mainContainer.addChild(roomGraphics);
    });

    // Zoom controls
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.5, Math.min(3, zoom * factor));
      setZoom(newZoom);
      if (mainContainer) {
        mainContainer.scale.set(newZoom, newZoom);
      }
    };

    canvasRef.current.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvasRef.current?.removeEventListener('wheel', onWheel);
      pixiApp.destroy(true, true);
    };
  }, [zoom]);

  return (
    <div className="w-full h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b-2 border-cyan-500 p-4 flex justify-between items-center">
        <div className="text-cyan-500 font-mono text-lg font-bold">⚡ AGENT HQ</div>
        <div className="flex gap-6 text-gray-400 text-sm font-mono">
          <div>Zoom: {zoom.toFixed(1)}x</div>
          <div className="text-green-500">● System Online</div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden bg-black">
        <canvas ref={canvasRef} className="w-full h-full" />

        {/* Detail Panel */}
        {selectedRoom && (
          <div className="absolute bottom-6 right-6 w-80 bg-gray-950 border-2 border-cyan-500 p-5 font-mono text-sm shadow-2xl rounded-lg">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-700">
              <span className="text-cyan-500 font-bold text-base">{selectedRoom.name}</span>
              <button onClick={() => setSelectedRoom(null)} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
            </div>

            <div className="space-y-3 text-gray-300">
              <div className="flex justify-between">
                <span>Status:</span>
                <span className={selectedRoom.status === 'working' ? 'text-green-500' : 'text-gray-500'}>
                  {selectedRoom.status.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Active Tasks:</span>
                <span className="text-yellow-400">{selectedRoom.taskCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Memory:</span>
                <span className="text-blue-400">2.3 GB / 8.0 GB</span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-gray-700 flex gap-2">
              <button className="flex-1 bg-cyan-600 hover:bg-cyan-700 px-3 py-2 text-white text-xs font-mono rounded transition">
                Enter
              </button>
              <button className="flex-1 bg-green-600 hover:bg-green-700 px-3 py-2 text-white text-xs font-mono rounded transition">
                Command
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="bg-gray-900 border-t-2 border-cyan-500 p-3 flex justify-between text-xs text-gray-500 font-mono">
        <div>Memory: 2.3 GB / 8.0 GB</div>
        <div>Tasks: 12 active | 3 queued</div>
        <div>Uptime: 5d 12h 34m</div>
      </div>
    </div>
  );
};

export default AgentHQDashboard;
