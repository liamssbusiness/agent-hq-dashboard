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
// Starfield + nebula (screen space)
// ---------------------------------------------------------------------------

export function drawStarfield(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.fillStyle = '#05030f';
  ctx.fillRect(0, 0, w, h);

  // Purple nebula haze
  const neb = ctx.createRadialGradient(w * 0.8, h * 0.15, 0, w * 0.8, h * 0.15, w * 0.7);
  neb.addColorStop(0, 'rgba(120, 60, 200, 0.10)');
  neb.addColorStop(1, 'rgba(120, 60, 200, 0)');
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, w, h);
  const neb2 = ctx.createRadialGradient(w * 0.1, h * 0.85, 0, w * 0.1, h * 0.85, w * 0.6);
  neb2.addColorStop(0, 'rgba(60, 90, 200, 0.08)');
  neb2.addColorStop(1, 'rgba(60, 90, 200, 0)');
  ctx.fillStyle = neb2;
  ctx.fillRect(0, 0, w, h);

  // Twinkling stars — deterministic positions, phase-shifted twinkle
  const count = 90;
  for (let i = 0; i < count; i++) {
    const sx = hash(i * 2 + 1) * w;
    const sy = hash(i * 2 + 2) * h;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t / 900 + i * 1.7));
    const size = i % 11 === 0 ? 3 : i % 3 === 0 ? 2 : 1;
    ctx.globalAlpha = tw;
    ctx.fillStyle = i % 7 === 0 ? '#b9a6ff' : '#e8ecff';
    ctx.fillRect(Math.floor(sx), Math.floor(sy), size, size);
  }
  ctx.globalAlpha = 1;
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

export function drawTicker(ctx: CanvasRenderingContext2D, w: number, y: number, text: string, t: number) {
  const h = 20;
  ctx.fillStyle = 'rgba(2, 8, 4, 0.92)';
  ctx.fillRect(0, y, w, h);
  ctx.fillStyle = 'rgba(0, 255, 65, 0.25)';
  ctx.fillRect(0, y + h - 1, w, 1);

  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2bff6f';
  const tw = ctx.measureText(text).width + 80;
  const off = (t / 18) % tw;
  ctx.fillText(text, w - off, y + h / 2 + 0.5);
  ctx.fillText(text, w - off + tw, y + h / 2 + 0.5);
}

/** Scanline overlay for the CRT feel (screen space, draw last). */
export function drawScanlines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#000000';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;
}
