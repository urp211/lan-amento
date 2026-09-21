import type { TestType } from "../types";

export interface TestSignal {
  canvas: HTMLCanvasElement;
  start(): void;
  stop(): void;
}

const BARS = ["#ffffff", "#f6f600", "#00f6f6", "#00f600", "#f600f6", "#f60000", "#0000f6", "#2b2b2b"];

/**
 * Gera um sinal de teste no ecrã (barras de cor, cinza 75% ou ruído)
 * num <canvas>, cujo stream pode ser capturado para gravação.
 */
export function createTestSignal(type: TestType): TestSignal {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  canvas.style.cssText =
    "width:100%;height:100%;object-fit:contain;background:#000;display:block;";

  const ctx = canvas.getContext("2d");
  const noise = document.createElement("canvas");
  noise.width = 256;
  noise.height = 144;
  const noiseCtx = noise.getContext("2d");

  let raf = 0;
  let running = false;

  function frame(t: number): void {
    if (!running || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    if (type === "bars") {
      const bw = w / BARS.length;
      for (let i = 0; i < BARS.length; i++) {
        ctx.fillStyle = BARS[i];
        ctx.fillRect(i * bw, 0, bw + 1, (h * 2) / 3);
      }
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, (h * 2) / 3, w, h / 3);

      // varrimento móvel
      const x = (t / 8) % w;
      const grad = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, "rgba(255,255,255,0.35)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x - 60, (h * 2) / 3, 120, h / 3);

      const now = new Date();
      ctx.fillStyle = "#e5e7eb";
      ctx.textAlign = "center";
      ctx.font = "bold 34px system-ui, sans-serif";
      ctx.fillText("SIGNAL TV — SINAL DE TESTE", w / 2, h - 60);
      ctx.font = "bold 46px ui-monospace, monospace";
      ctx.fillText(now.toLocaleTimeString("pt-BR"), w / 2, h - 18);
    } else if (type === "gray") {
      ctx.fillStyle = "#b9b9b9";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#262626";
      ctx.fillRect(w / 2 - 8, 0, 16, h);
      ctx.fillRect(0, h / 2 - 8, w, 16);

      // ponto de 100 Hz (liga/desliga)
      const on = Math.floor(t / 10) % 2 === 0;
      ctx.fillStyle = on ? "#f5f5f5" : "#1f1f1f";
      ctx.beginPath();
      ctx.arc(w * 0.25, h * 0.25, 46, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#111111";
      ctx.textAlign = "center";
      ctx.font = "bold 30px system-ui, sans-serif";
      ctx.fillText("SIGNAL TV — SINAL DE TESTE · CINZA 75%", w / 2, h - 30);
    } else if (noiseCtx) {
      const img = noiseCtx.createImageData(256, 144);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
      noiseCtx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(noise, 0, 0, w, h);
    }

    raf = requestAnimationFrame(frame);
  }

  return {
    canvas,
    start() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
