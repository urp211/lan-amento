import { useEffect, useRef, useState } from "react";
import Hls, { type HlsConfig } from "hls.js";
import mpegts from "mpegts.js";
import { Circle, Square, Tv } from "lucide-react";
import type { Channel, NetMode } from "../types";
import { createTestSignal, type TestSignal } from "../lib/testsignal";

interface PlayerProps {
  channel: Channel | null;
  localFile: string | null;
  udpxy: string;
  netMode: NetMode;
  onStatus: (msg: string | null) => void;
}

type MpegPlayer = ReturnType<typeof mpegts.createPlayer>;

const MAX_NET_RETRIES = 5;

function normalizeUdpxy(raw: string): string | null {
  const s = raw.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!s) return null;
  return s.includes(":") ? s : `${s}:4022`;
}

function resolveStreamUrl(
  channel: Channel,
  udpxy: string
): { url: string; needsProxyHint: boolean } {
  const url = channel.url.trim();
  if (url.startsWith("udp://")) {
    const proxy = normalizeUdpxy(udpxy);
    if (proxy) {
      return { url: `http://${proxy}/udp/${url.slice("udp://".length)}`, needsProxyHint: false };
    }
    return { url, needsProxyHint: true };
  }
  return { url, needsProxyHint: false };
}

/**
 * Configuração do hls.js conforme o plano de internet:
 * - auto:    ABR padrão + retries generosos
 * - stable:  buffer grande (menos cortes em ligações instáveis)
 * - economy: limita a bitrate (planos fracos / mobilidade)
 */
function hlsConfigFor(mode: NetMode): Partial<HlsConfig> {
  const base: Partial<HlsConfig> = {
    liveDurationInfinity: true,
    enableWorker: true,
    manifestLoadingMaxRetry: 4,
    manifestLoadingRetryDelay: 1000,
    levelLoadingMaxRetry: 4,
    fragLoadingMaxRetry: 6,
    fragLoadingRetryDelay: 1000,
    fragLoadingTimeOut: 20000,
  };
  if (mode === "stable") {
    base.maxBufferLength = 30;
    base.maxMaxBufferLength = 90;
    base.backBufferLength = 30;
  }
  if (mode === "economy") {
    // Começa no nível mais baixo e sobe devagar → menos dados em planos fracos.
    base.startLevel = 0;
    base.abrEwmaDefaultEstimate = 800_000;
    base.abrEwmaDefaultEstimateMax = 1_500_000;
    base.abrEwmaFastLive = 3;
    base.abrEwmaSlowLive = 6;
    base.abrBandWidthFactor = 0.7;
    base.maxBufferLength = 10;
  }
  return base;
}

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return "";
}

function fmtTime(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function Player({ channel, localFile, udpxy, netMode, onStatus }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const testWrapRef = useRef<HTMLDivElement | null>(null);
  const testRef = useRef<TestSignal | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [engineLabel, setEngineLabel] = useState<string | null>(null);

  /* ------------------- reprodução ------------------- */
  useEffect(() => {
    const video = videoRef.current;
    const wrap = testWrapRef.current;
    if (!video || !wrap) return;

    let hls: Hls | null = null;
    let mpeg: MpegPlayer | null = null;
    let test: TestSignal | null = null;
    let alive = true;
    let netRetries = 0;
    let mediaRetries = 0;
    const timers: number[] = [];

    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        if (alive) fn();
      }, ms);
      timers.push(id);
    };
    const backoff = (n: number) => Math.min(15000, 1000 * 2 ** Math.max(0, n - 1));

    // Parar gravação pendente ao trocar de fonte
    if (recorderRef.current) {
      recorderRef.current.stop();
    }

    video.pause();
    video.removeAttribute("src");
    video.load();
    wrap.innerHTML = "";
    testRef.current = null;
    setEngineLabel(null);
    onStatus(null);

    const fail = (msg: string) => {
      if (alive) onStatus(msg);
    };
    const onVideoError = () => {
      fail(
        "Não foi possível reproduzir esta fonte. Verifique a URL, a rede (LAN/internet/proxy) e o formato (HLS .m3u8, MPEG-TS .ts ou vídeo local)."
      );
    };
    const onPlaying = () => {
      if (!alive) return;
      netRetries = 0;
      mediaRetries = 0;
      onStatus(null);
    };
    video.addEventListener("error", onVideoError);
    video.addEventListener("playing", onPlaying);

    const destroyMpeg = () => {
      if (mpeg) {
        try {
          mpeg.destroy();
        } catch {
          /* já destruído */
        }
        mpeg = null;
      }
    };

    const startMpeg = (url: string) => {
      mpeg = mpegts.createPlayer({ type: "mse", isLive: true, url });
      mpeg.attachMediaElement(video);
      mpeg.load();
      mpeg.play();
      mpeg.on(mpegts.Events.ERROR, (errorType: string) => {
        if (!alive) return;
        if (errorType === mpegts.ErrorTypes.NETWORK_ERROR) {
          if (netRetries >= MAX_NET_RETRIES) {
            fail(
              "Sem resposta do fluxo. Verifique a rede/proxy e o emissor, depois clique no canal novamente."
            );
            return;
          }
          netRetries += 1;
          fail(
            `Sem resposta do fluxo — a reconectar (tentativa ${netRetries}/${MAX_NET_RETRIES})…`
          );
          later(() => {
            destroyMpeg();
            startMpeg(url);
          }, backoff(netRetries));
        } else if (errorType === mpegts.ErrorTypes.MEDIA_ERROR) {
          if (mediaRetries >= 2) {
            fail("Erro de decodificação no fluxo (código de vídeo/áudio não suportado).");
            return;
          }
          mediaRetries += 1;
          fail("A ajustar a decodificação do fluxo…");
          later(() => {
            destroyMpeg();
            startMpeg(url);
          }, 500);
        } else {
          fail("Erro no fluxo MPEG-TS. Verifique a URL e se o emissor está a transmitir.");
        }
      });
    };

    const cleanup = () => {
      alive = false;
      for (const id of timers) window.clearTimeout(id);
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("playing", onPlaying);
      if (hls) {
        hls.destroy();
        hls = null;
      }
      destroyMpeg();
      if (test) {
        test.stop();
        test.canvas.remove();
        test = null;
      }
      testRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    if (localFile) {
      video.src = localFile;
      setEngineLabel("Ficheiro local");
      video.play().catch(() => undefined);
      return cleanup;
    }

    if (!channel) return cleanup;

    if (channel.kind === "test") {
      test = createTestSignal(channel.testType ?? "bars");
      testRef.current = test;
      wrap.appendChild(test.canvas);
      test.start();
      setEngineLabel("Sinal de teste");
      return cleanup;
    }

    const { url, needsProxyHint } = resolveStreamUrl(channel, udpxy);

    if (needsProxyHint) {
      fail(
        "Fluxo udp:// (multicast): defina o endereço do servidor udpxy em Definições (ex.: 192.168.1.10:4022) para o reproduzir."
      );
      return cleanup;
    }

    if (/\.m3u8(\?|$)/i.test(url) && /^https?:/i.test(url)) {
      if (Hls.isSupported()) {
        hls = new Hls(hlsConfigFor(netMode));
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => undefined);
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!alive || !data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (netRetries >= MAX_NET_RETRIES) {
              fail(
                "Sem resposta ao fluxo. Verifique a internet, o proxy e o canal, depois tente novamente."
              );
              return;
            }
            netRetries += 1;
            fail(
              `Sem resposta ao fluxo — a reconectar (tentativa ${netRetries}/${MAX_NET_RETRIES})…`
            );
            later(() => {
              hls?.startLoad();
            }, backoff(netRetries));
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            if (mediaRetries >= 2) {
              fail("Erro de decodificação no fluxo HLS.");
              return;
            }
            mediaRetries += 1;
            fail("A recuperar o fluxo (erro de media)…");
            later(() => {
              hls?.recoverMediaError();
            }, 500);
          } else {
            fail(`Erro no fluxo HLS (${data.type}).`);
          }
        });
        setEngineLabel("HLS");
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        setEngineLabel("HLS (nativo)");
        video.play().catch(() => undefined);
      } else {
        fail("Este navegador não suporta HLS.");
      }
    } else if (/^https?:/i.test(url)) {
      if (mpegts.getFeatureList().mseLivePlayback) {
        startMpeg(url);
        setEngineLabel("MPEG-TS");
      } else {
        fail("Este navegador não suporta reprodução MPEG-TS (MediaSource).");
      }
    } else {
      fail("URL de canal inválida. Use http://, https:// ou udp://.");
    }

    return cleanup;
  }, [channel, localFile, udpxy, netMode, onStatus]);

  /* ------------------- gravação ------------------- */
  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const getActiveStream = (): MediaStream | null => {
    const test = testRef.current;
    if (channel?.kind === "test" && test) {
      return test.canvas.captureStream(30);
    }
    const video = videoRef.current;
    if (!video) return null;
    if (!channel && !localFile) return null;
    if (channel?.kind === "test") return null;
    try {
      // captureStream() existe no <video> (spec Media Capture), mas ainda
      // não está no lib.dom do TypeScript — usamos um cast local.
      const capture = (
        video as unknown as { captureStream(rate?: number): MediaStream }
      ).captureStream;
      const stream = capture.call(video);
      return stream.getVideoTracks().length > 0 ? stream : null;
    } catch {
      return null;
    }
  };

  const toggleRecording = () => {
    const current = recorderRef.current;
    if (current) {
      current.stop();
      return;
    }
    const stream = getActiveStream();
    if (!stream) {
      onStatus(
        "Gravação indisponível para esta fonte (fluxo remoto sem CORS ou sinal inativo)."
      );
      return;
    }
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      onStatus("Este navegador não permite gravar esta fonte.");
      return;
    }
    const chunks: BlobPart[] = [];
    const baseName =
      (channel ? channel.name : "ficheiro-local")
        .replace(/[\\/:*?"<>|]/g, "-")
        .slice(0, 40) || "gravacao";

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const blob = new Blob(chunks, { type });
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const a = document.createElement("a");
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `${baseName}_${stamp}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 30000);
      recorderRef.current = null;
      setRecording(false);
      stopTimer();
      setRecSeconds(0);
      onStatus("Gravação guardada — veja os descarregamentos do navegador.");
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
    setRecSeconds(0);
    timerRef.current = window.setInterval(() => setRecSeconds((s) => s + 1), 1000);
  };

  useEffect(
    () => () => {
      stopTimer();
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        try {
          recorderRef.current.stop();
        } catch {
          /* já parado */
        }
      }
    },
    []
  );

  /* ------------------- UI ------------------- */
  const idle = !channel && !localFile;
  const modeLabel =
    netMode === "stable" ? "estável" : netMode === "economy" ? "economia" : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full"
          playsInline
          controls={channel?.kind !== "test"}
        />
        <div ref={testWrapRef} className="absolute inset-0" />
        {idle && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Tv size={52} strokeWidth={1.5} />
            <p className="max-w-md px-4 text-center text-sm">
              Escolha um canal na lista, importe uma playlist M3U, adicione o
              canal da antena ou abra um ficheiro de vídeo local.
            </p>
          </div>
        )}
        {recording && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-red-500/40 bg-black/70 px-3 py-1 text-xs text-red-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            REC {fmtTime(recSeconds)}
          </div>
        )}
        {engineLabel && !recording && (
          <div className="absolute left-3 top-3 rounded-full border border-cyan-500/30 bg-black/70 px-3 py-1 text-xs text-cyan-300">
            {engineLabel}
            {modeLabel ? ` · modo ${modeLabel}` : ""}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={toggleRecording}
          disabled={idle}
          className="flex items-center gap-2 rounded-lg bg-red-600/90 px-4 py-2 text-xs font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {recording ? <Square size={15} /> : <Circle size={15} />}
          {recording ? `Parar gravação (${fmtTime(recSeconds)})` : "Gravar"}
        </button>
        <span className="text-xs text-slate-500">
          Reconexão automática em falhas de rede · gravação guardada como
          .webm nos descarregamentos.
        </span>
      </div>
    </div>
  );
}
