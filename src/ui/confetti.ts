/** A tiny, self-contained confetti burst. Honors prefers-reduced-motion. */
const COLORS = ["#ffd43b", "#4dabf7", "#69db7c", "#ff8787", "#9775fa"];

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  color: string;
  size: number;
}

export function confettiBurst(count = 90): void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "9999",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const W = window.innerWidth;
  const bits: Bit[] = Array.from({ length: count }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 200,
    y: -20 - Math.random() * 60,
    vx: (Math.random() - 0.5) * 6,
    vy: 2 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: COLORS[(Math.random() * COLORS.length) | 0]!,
    size: 6 + Math.random() * 6,
  }));

  let frames = 0;
  const maxFrames = 200;
  function frame() {
    frames++;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const b of bits) {
      b.vy += 0.12;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.globalAlpha = Math.max(0, 1 - frames / maxFrames);
      ctx.fillRect(-b.size / 2, -b.size / 2, b.size, b.size * 0.6);
      ctx.restore();
    }
    if (frames < maxFrames) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
