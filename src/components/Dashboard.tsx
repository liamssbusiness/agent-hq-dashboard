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
  taskCount: number;
}

const AgentHQDashboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const rooms: Room[] = [
    { id: 'hub', name: 'Central Hub', x: 400, y: 300, width: 120, height: 120, color: '#00d4ff', status: 'working', taskCount: 12 },
    { id: 'code', name: 'Code Lab', x: 200, y: 150, width: 100, height: 100, color: '#00ff41', status: 'idle', taskCount: 0 },
    { id: 'ads', name: 'Ads Studio', x: 600, y: 150, width: 100, height: 100, color: '#ff006e', status: 'working', taskCount: 3 },
    { id: 'trading', name: 'Trading Desk', x: 200, y: 450, width: 100, height: 100, color: '#ffa500', status: 'working', taskCount: 4 },
    { id: 'social', name: 'Social Chamber', x: 600, y: 450, width: 100, height: 100, color: '#8B5CF6', status: 'working', taskCount: 2 },
    { id: 'revify', name: 'Revify HQ', x: 400, y: 450, width: 100, height: 100, color: '#3B82F6', status: 'working', taskCount: 2 },
    { id: 'learning', name: 'Learning Room', x: 400, y: 50, width: 100, height: 100, color: '#00ff41', status: 'idle', taskCount: 1 },
  ];

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Draw function
    const draw = () => {
      // Clear canvas
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
      ctx.scale(zoom, zoom);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);

      // Draw hallways
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.2)';
      ctx.lineWidth = 2;
      rooms.slice(1).forEach((room) => {
        ctx.beginPath();
        ctx.moveTo(rooms[0].x + rooms[0].width / 2, rooms[0].y + rooms[0].height / 2);
        ctx.lineTo(room.x + room.width / 2, room.y + room.height / 2);
        ctx.stroke();
      });

      // Draw rooms
      rooms.forEach((room) => {
        // Draw glow
        if (room.status === 'working') {
          ctx.strokeStyle = room.color + '66';
          ctx.lineWidth = 3;
          ctx.strokeRect(room.x - 8, room.y - 8, room.width + 16, room.height + 16);
        }

        // Draw room
        ctx.strokeStyle = room.color;
        ctx.lineWidth = room.status === 'working' ? 3 : 1;
        ctx.fillStyle = room.color + '14';
        ctx.fillRect(room.x, room.y, room.width, room.height);
        ctx.strokeRect(room.x, room.y, room.width, room.height);

        // Draw name
        ctx.fillStyle = room.color;
        ctx.font = '13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(room.name, room.x + room.width / 2, room.y + room.height / 2);

        // Draw status indicator
        ctx.fillStyle = room.status === 'working' ? '#00ff41' : '#666666';
        ctx.beginPath();
        ctx.arc(room.x + 10, room.y + room.height - 10, 4, 0, Math.PI * 2);
        ctx.fill();

        // Draw task count
        if (room.taskCount > 0) {
          ctx.fillStyle = '#ff006e';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(room.taskCount.toString(), room.x + room.width - 8, room.y + 15);
        }
      });

      ctx.restore();
    };

    draw();

    // Zoom handler
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.max(0.5, Math.min(3, z * factor)));
    };

    // Pan handlers
    const handleMouseDown = (e: MouseEvent) => {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    // Animation loop
    const animate = () => {
      draw();
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zoom, pan, isDragging, dragStart, selectedRoom]);

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
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onClick={(e) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = (e.clientX - rect.left) / zoom - rect.width / 2 / zoom + rect.width / 2;
            const y = (e.clientY - rect.top) / zoom - rect.height / 2 / zoom + rect.height / 2;
            
            const clicked = rooms.find(
              (r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
            );
            setSelectedRoom(clicked || null);
          }}
        />

        {/* Detail Panel */}
        {selectedRoom && (
          <div className="absolute bottom-6 right-6 w-80 bg-gray-950 border-2 border-cyan-500 p-5 font-mono text-sm shadow-2xl rounded-lg">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-700">
              <span className="text-cyan-500 font-bold text-base">{selectedRoom.name}</span>
              <button
                onClick={() => setSelectedRoom(null)}
                className="text-gray-500 hover:text-gray-300 text-xl"
              >
                ✕
              </button>
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
