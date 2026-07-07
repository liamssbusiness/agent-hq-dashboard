// Procedural pixel-art renderer for the Agent HQ station view.
// Everything is drawn with chunky PX-aligned rects so it reads as pixel art
// without shipping any image assets. All functions draw in *world* space
// unless noted; the Dashboard applies the pan/zoom transform.

export const PX = 4; // world units per "pixel" — the chunkiness knob

export interface RoomTheme {
  base: string; // neon accent
  floor: string; // interior floor
  wall: string; // wall band
  props: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) => void;
}

const p = (n: number) => Math.round(n / PX) * PX; // snap to pixel grid

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(p(x), p(y), p(w), p(h));
}

/** Deterministic per-seed pseudo-random in [0,1) — stable across frames. */
function hash(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------------------
// Starfield + nebula (screen space, offset-aware so it can fill the CRT screen)
// ---------------------------------------------------------------------------

export function drawStarfield(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  ctx.fillStyle = '#05030f';
  ctx.fillRect(x, y, w, h);

  // Purple nebula haze
  const neb = ctx.createRadialGradient(x + w * 0.8, y + h * 0.15, 0, x + w * 0.8, y + h * 0.15, w * 0.7);
  neb.addColorStop(0, 'rgba(120, 60, 200, 0.10)');
  neb.addColorStop(1, 'rgba(120, 60, 200, 0)');
  ctx.fillStyle = neb;
  ctx.fillRect(x, y, w, h);
  const neb2 = ctx.createRadialGradient(x + w * 0.1, y + h * 0.85, 0, x + w * 0.1, y + h * 0.85, w * 0.6);
  neb2.addColorStop(0, 'rgba(60, 90, 200, 0.08)');
  neb2.addColorStop(1, 'rgba(60, 90, 200, 0)');
  ctx.fillStyle = neb2;
  ctx.fillRect(x, y, w, h);

  // Twinkling stars — deterministic positions, phase-shifted twinkle
  const count = 90;
  for (let i = 0; i < count; i++) {
    const sx = x + hash(i * 2 + 1) * w;
    const sy = y + hash(i * 2 + 2) * h;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + i * 1.7));
    const size = i % 11 === 0 ? 3 : i % 3 === 0 ? 2 : 1;
    ctx.globalAlpha = tw;
    ctx.fillStyle = i % 7 === 0 ? '#b9a6ff' : '#e8ecff';
    ctx.fillRect(Math.floor(sx), Math.floor(sy), size, size);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// The physical scene: dark room wall, wooden desk, retro CRT monitor chrome
// ---------------------------------------------------------------------------

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Compute monitor/desk layout for a canvas size. */
export function computeScene(w: number, h: number): { screen: ScreenRect; deskTop: number; bezel: ScreenRect } {
  const deskH = Math.max(96, Math.min(150, h * 0.15));
  const deskTop = h - deskH;
  const bezel: ScreenRect = { x: 10, y: 8, w: w - 20, h: deskTop - 2 };
  const bz = 26; // bezel thickness
  const screen: ScreenRect = { x: bezel.x + bz, y: bezel.y + bz + 8, w: bezel.w - bz * 2, h: bezel.h - bz * 2 - 14 };
  return { screen, deskTop, bezel };
}

/** Dark room wall behind the monitor with faint sparkles. */
export function drawWall(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1a1030');
  g.addColorStop(1, '#0d0818');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const sx = hash(i * 3 + 7) * w;
    const sy = hash(i * 3 + 8) * h;
    ctx.globalAlpha = 0.25 + 0.4 * Math.abs(Math.sin(t / 1400 + i));
    ctx.fillStyle = '#c9b8ff';
    ctx.fillRect(Math.floor(sx), Math.floor(sy), i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }
  ctx.globalAlpha = 1;
}

/** Wooden desk with keyboard, mouse, floppies and a coffee cup. */
export function drawDesk(ctx: CanvasRenderingContext2D, w: number, h: number, deskTop: number, bezel: ScreenRect) {
  const deskH = h - deskTop;

  // Monitor stand (behind the desk edge)
  const cx = w / 2;
  ctx.fillStyle = '#c9c2ae';
  ctx.fillRect(cx - 70, deskTop - 8, 140, 12);
  ctx.fillStyle = '#b3ac97';
  ctx.fillRect(cx - 96, deskTop + 2, 192, 8);

  // Desk surface — wood planks
  ctx.fillStyle = '#5a3a22';
  ctx.fillRect(0, deskTop, w, deskH);
  ctx.fillStyle = '#4d3019';
  ctx.fillRect(0, deskTop, w, 4);
  for (let i = 1; i < 4; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, deskTop + (deskH / 4) * i, w, 2);
  }
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(hash(90 + i) * w, deskTop + 6 + hash(91 + i) * (deskH - 10), 30 + hash(92 + i) * 60, 1);
  }

  const midY = deskTop + deskH * 0.24;

  // Keyboard (centered)
  const kw = Math.min(360, w * 0.34);
  const kx = cx - kw / 2;
  const kh = deskH * 0.5;
  ctx.fillStyle = '#8f8a7a';
  ctx.fillRect(kx - 4, midY - 2, kw + 8, kh + 6);
  ctx.fillStyle = '#c9c2ae';
  ctx.fillRect(kx, midY, kw, kh);
  ctx.fillStyle = '#a8a190';
  const rows = 4;
  const cols = 14;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillRect(kx + 5 + c * ((kw - 10) / cols), midY + 4 + r * ((kh - 8) / rows), (kw - 10) / cols - 3, (kh - 8) / rows - 3);
    }
  }
  ctx.fillStyle = '#c03b2e'; // red escape key
  ctx.fillRect(kx + 5, midY + 4, (kw - 10) / cols - 3, (kh - 8) / rows - 3);

  // Mouse (right of keyboard) with red trackball
  const mx = kx + kw + Math.min(90, w * 0.06);
  ctx.fillStyle = '#c9c2ae';
  ctx.fillRect(mx, midY + 4, 46, kh * 0.8);
  ctx.fillStyle = '#8f8a7a';
  ctx.fillRect(mx, midY + 4, 46, 6);
  ctx.fillStyle = '#c03b2e';
  ctx.beginPath();
  ctx.arc(mx + 23, midY + 10 + kh * 0.35, 9, 0, Math.PI * 2);
  ctx.fill();
  // Mouse cable up to the monitor
  ctx.strokeStyle = '#9a927e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mx + 23, midY + 4);
  ctx.quadraticCurveTo(mx + 60, deskTop - 10, bezel.x + bezel.w - 60, deskTop - 2);
  ctx.stroke();

  // Floppy disks (left), stacked
  const fx = Math.max(14, kx - Math.min(180, w * 0.14));
  for (let i = 0; i < 2; i++) {
    const fy = midY + i * (kh * 0.55) - i * 4;
    ctx.fillStyle = i ? '#15151c' : '#22222c';
    ctx.fillRect(fx - i * 8, fy, 96, kh * 0.5);
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(fx - i * 8 + 10, fy + 5, 56, kh * 0.22);
    ctx.fillStyle = '#22222c';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(i ? 'LOGS' : 'CREW DATA', fx - i * 8 + 13, fy + 7);
    ctx.fillStyle = '#3b3b4a';
    ctx.fillRect(fx - i * 8 + 66, fy + 4, 18, kh * 0.18);
  }

  // Coffee cup (right) with planet logo
  const cupX = Math.min(w - 60, mx + 110);
  const cupY = deskTop + deskH * 0.18;
  ctx.fillStyle = '#efe9dd';
  ctx.fillRect(cupX, cupY + 8, 44, deskH * 0.62);
  ctx.fillStyle = '#d9d2c2';
  ctx.fillRect(cupX - 3, cupY, 50, 10);
  // Planet logo
  ctx.fillStyle = '#3b6fd4';
  ctx.beginPath();
  ctx.arc(cupX + 22, cupY + 8 + deskH * 0.3, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7fa4e8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cupX + 22, cupY + 8 + deskH * 0.3, 13, 4, -0.35, 0, Math.PI * 2);
  ctx.stroke();
}

/** Beige CRT bezel with brand label and power button. */
export function drawMonitorBezel(ctx: CanvasRenderingContext2D, bezel: ScreenRect, screen: ScreenRect, t: number) {
  // Plastic body with simple rounded feel
  ctx.fillStyle = '#cfc8b4';
  ctx.fillRect(bezel.x, bezel.y, bezel.w, bezel.h);
  ctx.fillStyle = '#e2dcc8';
  ctx.fillRect(bezel.x, bezel.y, bezel.w, 6);
  ctx.fillRect(bezel.x, bezel.y, 6, bezel.h);
  ctx.fillStyle = '#a89f88';
  ctx.fillRect(bezel.x, bezel.y + bezel.h - 8, bezel.w, 8);
  ctx.fillRect(bezel.x + bezel.w - 8, bezel.y, 8, bezel.h);
  // Corner screw dots
  ctx.fillStyle = '#8f8871';
  for (const [sx, sy] of [
    [bezel.x + 10, bezel.y + 10],
    [bezel.x + bezel.w - 14, bezel.y + 10],
    [bezel.x + 10, bezel.y + bezel.h - 14],
    [bezel.x + bezel.w - 14, bezel.y + bezel.h - 14],
  ]) {
    ctx.fillRect(sx, sy, 4, 4);
  }

  // Brand label
  ctx.fillStyle = '#3a3630';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('AGENT HQ', bezel.x + 22, bezel.y + 17);

  // Power button + LED (top right, like the reference)
  ctx.fillStyle = '#b3ac97';
  ctx.fillRect(bezel.x + bezel.w - 46, bezel.y + 8, 22, 16);
  ctx.fillStyle = '#3a3630';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('⏻', bezel.x + bezel.w - 40, bezel.y + 17);
  ctx.fillStyle = Math.sin(t / 1000) > -0.9 ? '#39ff6a' : '#1d5c31';
  ctx.fillRect(bezel.x + bezel.w - 62, bezel.y + 13, 6, 6);

  // Screen inset shadow ring
  ctx.fillStyle = '#191512';
  ctx.fillRect(screen.x - 6, screen.y - 6, screen.w + 12, screen.h + 12);
}

/** Glass vignette + phosphor sheen over the screen contents (draw last). */
export function drawScreenGlass(ctx: CanvasRenderingContext2D, s: ScreenRect) {
  const edge = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
  edge.addColorStop(0, 'rgba(0,0,0,0.35)');
  edge.addColorStop(0.08, 'rgba(0,0,0,0)');
  edge.addColorStop(0.92, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = edge;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  const side = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y);
  side.addColorStop(0, 'rgba(0,0,0,0.32)');
  side.addColorStop(0.06, 'rgba(0,0,0,0)');
  side.addColorStop(0.94, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = side;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  // Faint diagonal sheen
  const sheen = ctx.createLinearGradient(s.x, s.y, s.x + s.w * 0.5, s.y + s.h);
  sheen.addColorStop(0, 'rgba(180,220,255,0.05)');
  sheen.addColorStop(0.25, 'rgba(180,220,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(s.x, s.y, s.w, s.h);
}

// ---------------------------------------------------------------------------
// In-screen instrument rails (left/right vertical strips with live gauges)
// ---------------------------------------------------------------------------

export interface RailAgent {
  id: string;
  color: string;
  frac: number; // 0..1 token budget used
  working: boolean;
}

export const RAIL_W = 46;

export function drawRails(ctx: CanvasRenderingContext2D, s: ScreenRect, agents: RailAgent[], t: number, extra: { msgs: number; cost: number }) {
  for (const side of [0, 1] as const) {
    const rx = side === 0 ? s.x : s.x + s.w - RAIL_W;
    ctx.fillStyle = '#0b0f1e';
    ctx.fillRect(rx, s.y, RAIL_W, s.h);
    ctx.fillStyle = '#1c2440';
    ctx.fillRect(side === 0 ? rx + RAIL_W - 3 : rx, s.y, 3, s.h);
    // Panel seams
    for (let y = s.y + 30; y < s.y + s.h; y += 64) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(rx + 4, y, RAIL_W - 8, 1);
    }
  }

  // LEFT rail: per-agent token gauges
  const lx = s.x + 8;
  let ly = s.y + 26;
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#5f6f9e';
  ctx.fillText('TOKENS', lx, s.y + 10);
  const gaugeH = Math.max(20, Math.min(44, (s.h - 60) / agents.length - 14));
  for (const a of agents) {
    ctx.fillStyle = '#050810';
    ctx.fillRect(lx, ly, 12, gaugeH);
    const fh = Math.max(2, a.frac * (gaugeH - 2));
    ctx.fillStyle = a.color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(lx + 2, ly + gaugeH - 1 - fh, 8, fh);
    ctx.globalAlpha = 1;
    // Working LED
    if (a.working && Math.sin(t / 260 + a.frac * 9) > -0.2) {
      ctx.fillStyle = '#39ff6a';
      ctx.fillRect(lx + 18, ly + 2, 4, 4);
    }
    ctx.fillStyle = '#5f6f9e';
    ctx.fillText(a.id.slice(0, 4).toUpperCase(), lx + 16, ly + gaugeH - 8);
    ly += gaugeH + 12;
  }

  // RIGHT rail: readouts + blinky column
  const rrx = s.x + s.w - RAIL_W + 7;
  ctx.fillStyle = '#5f6f9e';
  ctx.fillText('COMMS', rrx, s.y + 10);
  ctx.fillStyle = '#2bff6f';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(String(extra.msgs).padStart(3, '0'), rrx, s.y + 24);
  ctx.fillStyle = '#5f6f9e';
  ctx.font = 'bold 8px monospace';
  ctx.fillText('COST', rrx, s.y + 44);
  ctx.fillStyle = '#ffce6b';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`$${extra.cost.toFixed(2)}`, rrx, s.y + 58);

  // Bar meter
  ctx.fillStyle = '#5f6f9e';
  ctx.font = 'bold 8px monospace';
  ctx.fillText('LOAD', rrx, s.y + 82);
  for (let i = 0; i < 8; i++) {
    const on = Math.sin(t / 300 + i * 0.9) > (i - 4) / 5;
    ctx.fillStyle = on ? (i > 5 ? '#ff5a5a' : '#39ff6a') : '#11331d';
    ctx.fillRect(rrx + i * 4, s.y + 94, 3, 8);
  }

  // Blinking diagnostic LEDs down the rail
  for (let i = 0; i < Math.floor((s.h - 140) / 26); i++) {
    const on = hash(200 + i + Math.floor(t / (400 + i * 60))) > 0.45;
    ctx.fillStyle = on ? ['#39ff6a', '#2bd9ff', '#ffce6b', '#ff5a5a'][i % 4] : '#141a2e';
    ctx.fillRect(rrx + (i % 2) * 14, s.y + 124 + i * 26, 5, 5);
  }
}

// ---------------------------------------------------------------------------
// Corridor lattice (world space) — the structural frame rooms sit in
// ---------------------------------------------------------------------------

export function drawCorridor(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  // A short passage between two door points (horizontal or vertical).
  const horiz = Math.abs(y2 - y1) < Math.abs(x2 - x1);
  const wallW = PX * 2;
  if (horiz) {
    const y = p(Math.min(y1, y2)) - PX * 4;
    const x = p(Math.min(x1, x2));
    const len = p(Math.abs(x2 - x1));
    rect(ctx, x, y, len, PX * 8, '#101426');
    rect(ctx, x, y - wallW, len, wallW, '#2a3352');
    rect(ctx, x, y + PX * 8, len, wallW, '#2a3352');
    // Door frames at each end
    rect(ctx, x - PX, y - wallW, PX * 2, PX * 12, '#3d4a75');
    rect(ctx, x + len - PX, y - wallW, PX * 2, PX * 12, '#3d4a75');
  } else {
    const x = p(Math.min(x1, x2)) - PX * 4;
    const y = p(Math.min(y1, y2));
    const len = p(Math.abs(y2 - y1));
    rect(ctx, x, y, PX * 8, len, '#101426');
    rect(ctx, x - wallW, y, wallW, len, '#2a3352');
    rect(ctx, x + PX * 8, y, wallW, len, '#2a3352');
    rect(ctx, x - wallW, y - PX, PX * 12, PX * 2, '#3d4a75');
    rect(ctx, x - wallW, y + len - PX, PX * 12, PX * 2, '#3d4a75');
  }
}

// ---------------------------------------------------------------------------
// Room shell: metallic frame, header bar, floor, wall band
// ---------------------------------------------------------------------------

export function drawRoomShell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: RoomTheme,
  name: string,
  status: 'idle' | 'working' | 'error',
  t: number,
  selected: boolean,
) {
  const header = PX * 7;

  // Outer metallic frame with bevel
  rect(ctx, x - PX * 3, y - PX * 3, w + PX * 6, h + PX * 6, '#1b2138');
  rect(ctx, x - PX * 2, y - PX * 2, w + PX * 4, h + PX * 4, '#39415f');
  rect(ctx, x - PX, y - PX, w + PX * 2, h + PX * 2, '#0c0f1d');

  // Corner bolts
  for (const [bx, by] of [
    [x - PX * 3, y - PX * 3],
    [x + w, y - PX * 3],
    [x - PX * 3, y + h],
    [x + w, y + h],
  ]) {
    rect(ctx, bx + PX, by + PX, PX, PX, '#6b7699');
  }

  // Header bar
  rect(ctx, x, y, w, header, '#0a0d1a');
  rect(ctx, x, y + header - PX, w, PX, theme.base);
  ctx.globalAlpha = 0.25;
  rect(ctx, x, y, w, header - PX, theme.base);
  ctx.globalAlpha = 1;

  // Header text
  ctx.fillStyle = theme.base;
  ctx.font = `bold ${PX * 3.2}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`◆ ${name.toUpperCase()}`, x + PX * 3, y + header / 2 + 1);

  // Status LED (blinks while working, solid red on error)
  const ledOn = status === 'working' ? Math.sin(t / 220) > -0.3 : true;
  const led = status === 'error' ? '#ff2222' : status === 'working' ? '#39ff6a' : '#5a6584';
  if (ledOn) rect(ctx, x + w - PX * 5, y + PX * 2, PX * 2, PX * 2, led);

  // Floor
  rect(ctx, x, y + header, w, h - header, theme.floor);

  // Wall band along the top of the interior
  rect(ctx, x, y + header, w, PX * 5, theme.wall);
  // Wall panel seams
  for (let sx = x + PX * 6; sx < x + w - PX * 4; sx += PX * 12) {
    rect(ctx, sx, y + header, PX, PX * 5, 'rgba(0,0,0,0.35)');
  }

  // Floor tile seams (sparse)
  ctx.globalAlpha = 0.14;
  for (let gx = x + PX * 6; gx < x + w; gx += PX * 12) rect(ctx, gx, y + header + PX * 5, PX / 2 + 1, h - header - PX * 5, '#8899ff');
  for (let gy = y + header + PX * 10; gy < y + h; gy += PX * 10) rect(ctx, x, gy, w, PX / 2 + 1, '#8899ff');
  ctx.globalAlpha = 1;

  // Ambient neon glow from the room's core
  const cx = x + w / 2;
  const cy = y + header + (h - header) / 2 + PX * 2;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.45);
  const pulse = status === 'working' ? 0.22 + 0.08 * Math.sin(t / 400) : 0.14;
  glow.addColorStop(0, colorWithAlpha(theme.base, pulse));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x, y + header, w, h - header);

  // Selection highlight
  if (selected) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = PX;
    ctx.strokeRect(x - PX * 3.5, y - PX * 3.5, w + PX * 7, h + PX * 7);
  }
}

function colorWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Agent sprite — chunky pixel humanoid with idle bob / walk cycle
// ---------------------------------------------------------------------------

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  accent: string,
  t: number,
  status: 'idle' | 'working' | 'error',
  seed: number,
) {
  const phase = hash(seed) * 1000;
  let sx = x;
  const bob = Math.round(Math.abs(Math.sin((t + phase) / 350)) * PX) / 2;

  // Working agents pace back and forth
  if (status === 'working') {
    sx = x + Math.sin((t + phase) / 1200) * PX * 8;
  }
  sx = p(sx);
  const sy = p(y) - bob;
  const step = status === 'working' && Math.sin((t + phase) / 150) > 0;

  // Shadow
  ctx.globalAlpha = 0.35;
  rect(ctx, sx - PX, p(y) + PX * 6, PX * 4, PX, '#000000');
  ctx.globalAlpha = 1;

  // Legs
  rect(ctx, sx - PX, sy + PX * 4, PX, PX * 2, '#20263d');
  rect(ctx, sx + PX, sy + PX * (step ? 3.5 : 4), PX, PX * 2, '#20263d');
  // Body suit
  rect(ctx, sx - PX, sy + PX, PX * 3, PX * 3, '#2e3854');
  rect(ctx, sx - PX, sy + PX, PX * 3, PX, accent); // collar stripe
  // Arms
  rect(ctx, sx - PX * 2, sy + PX, PX, PX * 2, '#2e3854');
  rect(ctx, sx + PX * 2, sy + PX, PX, PX * 2, '#2e3854');
  // Head + visor
  rect(ctx, sx - PX, sy - PX * 2, PX * 3, PX * 3, '#d8b89a');
  rect(ctx, sx - PX, sy - PX * 1.5, PX * 3, PX, accent);

  // Error: alarm halo
  if (status === 'error' && Math.sin(t / 180) > 0) {
    ctx.strokeStyle = '#ff2222';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - PX * 2.5, sy - PX * 3.5, PX * 6, PX * 11);
  }
}

// ---------------------------------------------------------------------------
// Per-room themed props
// ---------------------------------------------------------------------------

/** Console: desk with a lit, flickering screen. */
function console_(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, t: number, seed: number) {
  rect(ctx, x, y + PX * 2, PX * 8, PX * 3, '#232a45'); // desk
  rect(ctx, x + PX, y - PX * 2, PX * 6, PX * 4, '#10131f'); // monitor
  const flick = 0.55 + 0.45 * hash(seed + Math.floor(t / 380));
  ctx.globalAlpha = flick;
  rect(ctx, x + PX * 1.5, y - PX * 1.5, PX * 5, PX * 3, color);
  ctx.globalAlpha = 1;
  // scan bar on screen
  const bar = Math.floor(((t / 500 + hash(seed) * 4) % 3));
  rect(ctx, x + PX * 1.5, y - PX * 1.5 + bar * PX, PX * 5, PX / 2 + 1, 'rgba(255,255,255,0.5)');
}

/** Concentric glowing portal rings (Central Hub). */
function hubProps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  const cx = x + w / 2;
  const cy = y + h / 2 + PX * 3;
  for (let i = 3; i >= 1; i--) {
    ctx.strokeStyle = colorWithAlpha('#00d4ff', 0.25 + 0.16 * i + 0.1 * Math.sin(t / 500 + i));
    ctx.lineWidth = PX;
    ctx.beginPath();
    ctx.arc(cx, cy, PX * 4 * i + PX, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Pedestal core
  rect(ctx, cx - PX * 2, cy - PX * 2, PX * 4, PX * 4, '#0b3444');
  rect(ctx, cx - PX, cy - PX, PX * 2, PX * 2, '#7ff4ff');
  // Orbiting spark
  const a = t / 800;
  rect(ctx, cx + Math.cos(a) * PX * 10, cy + Math.sin(a) * PX * 10, PX, PX, '#aef6ff');
  console_(ctx, x + PX * 4, y + PX * 10, '#00d4ff', t, 11);
  console_(ctx, x + w - PX * 13, y + PX * 10, '#00d4ff', t, 12);
}

/** Rows of dev desks + server rack (Code Lab). */
function codeProps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  console_(ctx, x + PX * 4, y + PX * 9, '#00ff41', t, 21);
  console_(ctx, x + PX * 16, y + PX * 9, '#00ff41', t, 22);
  console_(ctx, x + PX * 4, y + h - PX * 12, '#00ff41', t, 23);
  console_(ctx, x + PX * 16, y + h - PX * 12, '#00ff41', t, 24);
  // Server rack
  const rx = x + w - PX * 10;
  rect(ctx, rx, y + PX * 8, PX * 6, h - PX * 20, '#141b2e');
  for (let i = 0; i < Math.floor((h - PX * 22) / (PX * 3)); i++) {
    const on = hash(31 + i + Math.floor(t / 700)) > 0.4;
    rect(ctx, rx + PX, y + PX * 9 + i * PX * 3, PX, PX, on ? '#00ff41' : '#173123');
    rect(ctx, rx + PX * 3, y + PX * 9 + i * PX * 3, PX * 2, PX, '#0c1220');
  }
}

/** Giant animated billboard (Ads Studio). */
function adsProps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  const bx = x + PX * 5;
  const bw = w - PX * 10;
  rect(ctx, bx - PX, y + PX * 7, bw + PX * 2, PX * 14, '#160a14');
  for (let i = 0; i < 7; i++) {
    const bh = (0.3 + 0.7 * hash(41 + i + Math.floor(t / 600))) * PX * 10;
    rect(ctx, bx + PX + i * (bw / 7), y + PX * 19 - bh, bw / 7 - PX, bh, i % 2 ? '#ff006e' : '#ff5ea0');
  }
  rect(ctx, bx - PX, y + PX * 7, bw + PX * 2, PX, '#ff006e');
  console_(ctx, x + PX * 6, y + h - PX * 12, '#ff006e', t, 42);
  console_(ctx, x + w - PX * 16, y + h - PX * 12, '#ff006e', t, 43);
}

/** War-room round table + wall charts (Trading Desk). */
function tradingProps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  const cx = x + w / 2;
  const cy = y + h / 2 + PX * 4;
  // Round table with glowing ring
  ctx.fillStyle = '#1c1010';
  ctx.beginPath();
  ctx.arc(cx, cy, PX * 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colorWithAlpha('#ffa500', 0.7 + 0.3 * Math.sin(t / 450));
  ctx.lineWidth = PX;
  ctx.beginPath();
  ctx.arc(cx, cy, PX * 7, 0, Math.PI * 2);
  ctx.stroke();
  rect(ctx, cx - PX, cy - PX, PX * 2, PX * 2, '#ffd27a');
  // Candlestick wall charts
  for (let c = 0; c < 2; c++) {
    const chx = x + PX * 4 + c * (w - PX * 20);
    rect(ctx, chx, y + PX * 7, PX * 12, PX * 8, '#120c0c');
    for (let i = 0; i < 5; i++) {
      const up = hash(51 + i + c * 9 + Math.floor(t / 800)) > 0.45;
      const bh = (0.3 + 0.6 * hash(53 + i + c)) * PX * 5;
      rect(ctx, chx + PX + i * PX * 2.2, y + PX * 13 - bh, PX, bh, up ? '#39ff6a' : '#ff3b3b');
    }
  }
}

/** Lounge with floating chat bubbles (Social Chamber). */
function socialProps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  // Couches
  rect(ctx, x + PX * 5, y + h - PX * 13, PX * 12, PX * 4, '#3d2a63');
  rect(ctx, x + PX * 5, y + h - PX * 15, PX * 12, PX * 2, '#57407f');
  rect(ctx, x + w - PX * 17, y + h - PX * 13, PX * 12, PX * 4, '#3d2a63');
  rect(ctx, x + w - PX * 17, y + h - PX * 15, PX * 12, PX * 2, '#57407f');
  // Holo table
  rect(ctx, x + w / 2 - PX * 3, y + h / 2 + PX * 2, PX * 6, PX * 3, '#241638');
  // Floating chat bubbles — drift upward from the holo table and fade out
  const rise = h - PX * 20;
  for (let i = 0; i < 5; i++) {
    const prog = (t / (2600 + i * 700) + hash(62 + i)) % 1;
    const bx = x + w / 2 + (hash(61 + i) - 0.5) * (w - PX * 18) * (0.4 + prog * 0.8);
    const by = y + h - PX * 14 - prog * rise;
    ctx.globalAlpha = 0.85 * (1 - prog);
    rect(ctx, bx, by, PX * 3, PX * 2, i % 2 ? '#8B5CF6' : '#c4a7ff');
    rect(ctx, bx + PX, by + PX * 2, PX, PX, i % 2 ? '#8B5CF6' : '#c4a7ff');
    ctx.globalAlpha = 1;
  }
}

/** Pulsing reactor core with pipes (Revify HQ). */
function revifyProps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  const cx = x + w / 2;
  const cy = y + h / 2 + PX * 3;
  // Pipes
  rect(ctx, x, cy - PX, w * 0.28, PX * 2, '#1c2b52');
  rect(ctx, x + w * 0.72, cy - PX, w * 0.28, PX * 2, '#1c2b52');
  // Core housing
  rect(ctx, cx - PX * 6, cy - PX * 6, PX * 12, PX * 12, '#101a33');
  const pulse = 0.5 + 0.5 * Math.sin(t / 320);
  ctx.fillStyle = colorWithAlpha('#4d9fff', 0.35 + 0.5 * pulse);
  ctx.beginPath();
  ctx.arc(cx, cy, PX * (3.4 + pulse * 1.4), 0, Math.PI * 2);
  ctx.fill();
  rect(ctx, cx - PX, cy - PX, PX * 2, PX * 2, '#cfe8ff');
  console_(ctx, x + PX * 4, y + h - PX * 12, '#0066ff', t, 71);
  console_(ctx, x + w - PX * 13, y + h - PX * 12, '#0066ff', t, 72);
}

/** Archive shelves + reading pedestal (Learning Room). */
function learningProps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) {
  for (let s = 0; s < 2; s++) {
    const sy = y + PX * 8 + s * PX * 7;
    rect(ctx, x + PX * 4, sy, w - PX * 8, PX * 5, '#12241a');
    for (let i = 0; i < Math.floor((w - PX * 10) / (PX * 2)); i++) {
      const lit = hash(81 + i + s * 7) > 0.35;
      rect(ctx, x + PX * 5 + i * PX * 2, sy + PX, PX, PX * 3, lit ? (i % 3 ? '#00ff41' : '#8fff9e') : '#0c3320');
    }
  }
  // Reading pedestal with glow
  const cx = x + w / 2;
  const py = y + h - PX * 12;
  rect(ctx, cx - PX * 2, py, PX * 4, PX * 4, '#183524');
  const g = ctx.createRadialGradient(cx, py, 0, cx, py, PX * 8);
  g.addColorStop(0, colorWithAlpha('#00ff41', 0.3 + 0.15 * Math.sin(t / 500)));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - PX * 8, py - PX * 8, PX * 16, PX * 12);
}

export const THEMES: Record<string, RoomTheme> = {
  hub: { base: '#00d4ff', floor: '#0a1420', wall: '#123244', props: hubProps },
  code: { base: '#00ff41', floor: '#0a160e', wall: '#12321c', props: codeProps },
  ads: { base: '#ff006e', floor: '#170a12', wall: '#3a1028', props: adsProps },
  trading: { base: '#ffa500', floor: '#171006', wall: '#3a2a10', props: tradingProps },
  social: { base: '#8B5CF6', floor: '#120a1e', wall: '#2a1c48', props: socialProps },
  revify: { base: '#0066ff', floor: '#0a1020', wall: '#102448', props: revifyProps },
  learning: { base: '#00ff41', floor: '#0a1410', wall: '#10301e', props: learningProps },
};

// ---------------------------------------------------------------------------
// News ticker (screen space)
// ---------------------------------------------------------------------------

export function drawTicker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, text: string, t: number) {
  const h = 20;
  ctx.fillStyle = 'rgba(2, 8, 4, 0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0, 255, 65, 0.25)';
  ctx.fillRect(x, y + h - 1, w, 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2bff6f';
  const tw = ctx.measureText(text).width + 80;
  const off = (t / 18) % tw;
  ctx.fillText(text, x + w - off, y + h / 2 + 0.5);
  ctx.fillText(text, x + w - off + tw, y + h / 2 + 0.5);
  ctx.restore();
}

/** Scanline overlay for the CRT feel (screen space, draw last). */
export function drawScanlines(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#000000';
  for (let sy = y; sy < y + h; sy += 3) ctx.fillRect(x, sy, w, 1);
  ctx.globalAlpha = 1;
}
