import { useCallback, useEffect, useRef, useState } from "react";
import {
  Antenna,
  Film,
  Plus,
  Radio,
  Satellite,
  Settings,
  Trash2,
  Tv,
  Upload,
  X,
} from "lucide-react";
import type { Channel, NetMode } from "./types";
import { parseM3U } from "./lib/m3u";
import {
  loadChannels,
  loadSettings,
  loadUdpxy,
  saveChannels,
  saveSettings,
  saveUdpxy,
} from "./lib/storage";
import { Player } from "./components/Player";

const DEFAULT_CHANNELS: Channel[] = [
  {
    id: "test-bars",
    name: "Sinal de teste — barras",
    url: "test:bars",
    kind: "test",
    testType: "bars",
  },
  {
    id: "test-gray",
    name: "Sinal de teste — cinza 75%",
    url: "test:gray",
    kind: "test",
    testType: "gray",
  },
  {
    id: "test-snow",
    name: "Sinal de teste — ruído",
    url: "test:snow",
    kind: "test",
    testType: "snow",
  },
];

const NET_MODES: { id: NetMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "qualidade automática" },
  { id: "stable", label: "Estável", hint: "buffer grande" },
  { id: "economy", label: "Economia", hint: "menos dados" },
];

function sectionTitle(icon: React.ReactNode, text: string): React.ReactNode {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
      {icon}
      {text}
    </div>
  );
}

export default function App() {
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_CHANNELS);
  const [selectedId, setSelectedId] = useState<string | null>(
    DEFAULT_CHANNELS[0].id
  );
  const [udpxy, setUdpxy] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [udpxyDraft, setUdpxyDraft] = useState("");
  const [proxy, setProxy] = useState("");
  const [proxyDraft, setProxyDraft] = useState("");
  const [netMode, setNetMode] = useState<NetMode>("auto");
  const [dvbHost, setDvbHost] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [localFile, setLocalFile] = useState<string | null>(null);
  const [localName, setLocalName] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const m3uRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const applyProxy = useCallback((rules: string) => {
    const bridge = window.signalTV;
    if (bridge?.setProxy) {
      bridge
        .setProxy(rules)
        .then(() => undefined)
        .catch(() => setStatus("Não foi possível aplicar o proxy nesta versão."));
    }
  }, []);

  /* Carregar canais, udpxy e definições guardadas */
  useEffect(() => {
    (async () => {
      const [stored, udxpyProxy, settings] = await Promise.all([
        loadChannels(),
        loadUdpxy(),
        loadSettings(),
      ]);
      if (stored && stored.length > 0) {
        setChannels(stored);
        setSelectedId(stored[0].id);
      }
      if (udxpyProxy) {
        setUdpxy(udxpyProxy);
        setUdpxyDraft(udxpyProxy);
      }
      if (settings) {
        setNetMode(settings.netMode);
        setProxy(settings.proxy);
        setProxyDraft(settings.proxy);
        if (settings.proxy) applyProxy(settings.proxy);
      }
    })();
  }, [applyProxy]);

  /* Guardar a lista de canais sempre que mudar */
  useEffect(() => {
    saveChannels(channels);
  }, [channels]);

  /* Guardar e aplicar definições de rede */
  useEffect(() => {
    saveSettings({ proxy, netMode });
    applyProxy(proxy);
  }, [proxy, netMode, applyProxy]);

  const selected = channels.find((c) => c.id === selectedId) ?? null;
  const handleStatus = useCallback((msg: string | null) => setStatus(msg), []);

  const pickLocalFile = (file: File | null) => {
    if (!file) return;
    setLocalFile((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setLocalName(file.name);
    setSelectedId(null);
  };

  const importM3U = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const entries = parseM3U(String(reader.result ?? ""));
      if (entries.length === 0) {
        setStatus(
          "Nenhum canal válido encontrado na playlist (use URLs http://, https:// ou udp://)."
        );
        return;
      }
      setChannels((prev) => {
        const existing = new Set(prev.map((c) => c.url));
        const fresh = entries
          .filter((e) => !existing.has(e.url))
          .map((e): Channel => ({
            id: crypto.randomUUID(),
            name: e.name,
            url: e.url,
            kind: "stream",
          }));
        if (fresh.length === 0) {
          setStatus("Todos os canais da playlist já estavam na lista.");
        } else {
          setStatus(`${fresh.length} canais importados da playlist.`);
        }
        return [...prev, ...fresh];
      });
    };
    reader.readAsText(file);
  };

  const addChannel = () => {
    const url = newUrl.trim();
    if (!/^https?:\/\//i.test(url) && !url.startsWith("udp://")) {
      setStatus(
        "URL inválida. Use http://, https:// ou udp:// (ex.: udp://239.1.1.1:1234)."
      );
      return;
    }
    const id = crypto.randomUUID();
    setChannels((prev) => [
      ...prev,
      { id, name: newName.trim() || url, url, kind: "stream" },
    ]);
    setSelectedId(id);
    setNewName("");
    setNewUrl("");
    setShowAdd(false);
    setStatus("Canal adicionado.");
  };

  const removeChannel = (id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const saveUdpxySetting = () => {
    const v = udpxyDraft.trim();
    setUdpxy(v);
    saveUdpxy(v);
    setStatus(v ? `Servidor udpxy definido: ${v}` : "Servidor udpxy removido.");
  };

  const addDvbChannel = () => {
    const host = dvbHost
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "");
    if (!host) {
      setStatus("Indique o IP do computador/box que partilha o sinal da antena.");
      return;
    }
    const url = `http://${host}:8080`;
    if (channels.some((c) => c.url === url)) {
      setStatus("Esse canal da antena já está na lista.");
      return;
    }
    const id = crypto.randomUUID();
    setChannels((prev) => [
      ...prev,
      { id, name: `Antena — ${host}`, url, kind: "stream" },
    ]);
    setSelectedId(id);
    setStatus(
      "Canal da antena adicionado (VLC HTTP, porta 8080). Garanta que o VLC está a partilhar o sinal."
    );
  };

  const isDesktop = Boolean(window.signalTV);

  return (
    <div className="flex min-h-screen flex-col bg-[#05070d] text-slate-200">
      <header className="flex items-center gap-3 border-b border-slate-800/80 px-5 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-gradient-to-br from-cyan-500/20 to-indigo-500/20">
          <Radio size={18} className="text-cyan-400" />
        </div>
        <div className="mr-auto">
          <h1 className="text-base font-semibold leading-tight">Signal TV</h1>
          <p className="text-xs leading-tight text-slate-500">
            LAN (udpxy) · internet (HLS/TS) · antena DVB · proxy
          </p>
        </div>
        <button
          onClick={() => {
            setUdpxyDraft(udpxy);
            setProxyDraft(proxy);
            setShowSettings((v) => !v);
          }}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500"
        >
          <Settings size={14} />
          Definições
        </button>
      </header>

      {showSettings && (
        <div className="flex flex-col gap-4 border-b border-slate-800/80 bg-slate-950/60 px-5 py-4 text-xs text-slate-400">
          {/* ---------- udpxy (LAN) ---------- */}
          <div className="flex flex-col gap-1.5">
            {sectionTitle(<Radio size={13} className="text-cyan-400" />, "Multicast LAN (udpxy)")}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={udpxyDraft}
                onChange={(e) => setUdpxyDraft(e.target.value)}
                placeholder="192.168.1.10:4022"
                className="w-56 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-500/60"
              />
              <button
                onClick={saveUdpxySetting}
                className="rounded-md bg-cyan-600 px-3 py-1 text-white transition hover:bg-cyan-500"
              >
                Guardar
              </button>
            </div>
            <p className="text-slate-500">
              Fluxos <code>udp://</code> (multicast) precisam de um proxy{" "}
              <code>udpxy</code> num PC da mesma rede. Sem porta, é usada a 4022.
            </p>
          </div>

          {/* ---------- modo de rede / plano de internet ---------- */}
          <div className="flex flex-col gap-1.5">
            {sectionTitle(<Tv size={13} className="text-cyan-400" />, "Plano de internet / estabilidade")}
            <div className="flex flex-wrap items-center gap-2">
              {NET_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setNetMode(m.id)}
                  className={`rounded-md border px-3 py-1 transition ${
                    netMode === m.id
                      ? "border-cyan-500/70 bg-cyan-600/20 text-cyan-300"
                      : "border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {m.label} <span className="opacity-60">· {m.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-slate-500">
              Auto: qualidade conforme a velocidade. Estável: buffer maior,
              ideal para ligações instáveis. Economia: limita a qualidade para
              planos fracos ou mobilidade. Todos os modos incluem reconexão
              automática.
            </p>
          </div>

          {/* ---------- proxy do modem ---------- */}
          <div className="flex flex-col gap-1.5">
            {sectionTitle(<Settings size={13} className="text-cyan-400" />, "Proxy da rede / modem")}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={proxyDraft}
                onChange={(e) => setProxyDraft(e.target.value)}
                placeholder="http://192.168.1.1:3128"
                className="w-64 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-200 outline-none focus:border-cyan-500/60"
              />
              <button
                onClick={() => {
                  const v = proxyDraft.trim();
                  setProxy(v);
                  setStatus(
                    v
                      ? `Proxy definido: ${v}`
                      : "Proxy removido (ligação direta)."
                  );
                }}
                className="rounded-md bg-cyan-600 px-3 py-1 text-white transition hover:bg-cyan-500"
              >
                Guardar
              </button>
              {proxy && (
                <button
                  onClick={() => {
                    setProxyDraft("");
                    setProxy("");
                  }}
                  className="rounded-md border border-slate-700 px-3 py-1 transition hover:border-slate-500"
                >
                  Limpar
                </button>
              )}
            </div>
            <p className="text-slate-500">
              Para redes que exigem proxy (modem corporativo, hotel, escola).
              Exemplos: <code>http://10.0.0.1:3128</code> ou{" "}
              <code>socks5://192.168.1.1:1080</code>.
              {isDesktop
                ? " Na versão desktop, todos os fluxos passam por este proxy automaticamente."
                : " Na versão web, configure o proxy no próprio navegador (aplica-se a esta página)."}
            </p>
          </div>

          {/* ---------- antena parabólica / DVB ---------- */}
          <div className="flex flex-col gap-1.5">
            {sectionTitle(
              <Satellite size={13} className="text-cyan-400" />,
              "Antena parabólica / terrestre (DVB)"
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={dvbHost}
                onChange={(e) => setDvbHost(e.target.value)}
                placeholder="IP do PC/box com a antena (ex.: 192.168.1.50)"
                className="w-72 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 outline-none focus:border-cyan-500/60"
              />
              <button
                onClick={addDvbChannel}
                className="flex items-center gap-1.5 rounded-md bg-cyan-600 px-3 py-1 text-white transition hover:bg-cyan-500"
              >
                <Antenna size={12} />
                Adicionar canal da antena
              </button>
            </div>
            <p className="max-w-3xl leading-relaxed text-slate-500">
              O Signal TV reproduce o sinal da antena através de ponte de rede:
              ligue o recetor DVB-S/S2 (parabólica) ou DVB-T/T2 (terrestre) a
              um PC/box da sua casa e partilhe o canal por HTTP — no VLC:
              <em> Transmissão → Transcodificar</em> para o endpoint{" "}
              <code>http://IP:8080</code> (ou use tvheadend/web streamer). O
              botão acima cria o canal{" "}
              <code>http://IP:8080</code> pronto a ver — funciona em qualquer
              plano de internet, pois o sinal roda na sua rede local.
            </p>
          </div>

          <button
            onClick={() => setShowSettings(false)}
            className="flex w-fit items-center gap-1 self-end rounded-md border border-slate-700 px-3 py-1 text-slate-300 transition hover:border-slate-500"
          >
            <X size={12} />
            Fechar definições
          </button>
        </div>
      )}

      <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-2 lg:w-80">
          <div className="flex gap-2">
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-600/90 px-3 py-2 text-xs font-medium text-white transition hover:bg-cyan-500"
            >
              <Plus size={14} /> Novo canal
            </button>
            <button
              onClick={() => m3uRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-500"
            >
              <Upload size={14} /> Playlist M3U
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-500"
            >
              <Film size={14} /> Ficheiro
            </button>
          </div>

          <input
            ref={m3uRef}
            type="file"
            accept=".m3u,.m3u8,text/plain"
            className="hidden"
            onChange={(e) => {
              importM3U(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="video/*,audio/*"
            className="hidden"
            onChange={(e) => {
              pickLocalFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />

          {showAdd && (
            <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome do canal"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs outline-none focus:border-cyan-500/60"
              />
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="URL — http://, https:// ou udp://239.1.1.1:1234"
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-500/60"
              />
              <div className="flex gap-2">
                <button
                  onClick={addChannel}
                  className="flex-1 rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-cyan-500"
                >
                  Adicionar
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs transition hover:border-slate-500"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="max-h-[420px] flex-1 overflow-y-auto rounded-lg border border-slate-800/80 bg-slate-950/40 lg:max-h-[560px]">
            {localFile && (
              <div
                className={`flex items-center gap-2 border-b border-slate-800/60 px-3 py-2 text-xs ${
                  selectedId === null
                    ? "bg-cyan-600/15 text-cyan-300"
                    : "text-slate-300 hover:bg-slate-900"
                }`}
              >
                <button
                  onClick={() => setSelectedId(null)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Film size={14} className="shrink-0 opacity-70" />
                  <span className="truncate">
                    {localName ?? "Ficheiro local"}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setLocalFile((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return null;
                    });
                    setLocalName(null);
                  }}
                  title="Remover ficheiro"
                  className="text-slate-600 transition hover:text-red-400"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
            {channels.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 border-b border-slate-800/60 px-3 py-2 text-xs ${
                  selectedId === c.id
                    ? "bg-cyan-600/15 text-cyan-300"
                    : "text-slate-300 hover:bg-slate-900"
                }`}
              >
                <button
                  onClick={() => setSelectedId(c.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {c.kind === "test" ? (
                    <Radio size={14} className="shrink-0 opacity-70" />
                  ) : c.url.startsWith("udp://") ? (
                    <Antenna size={14} className="shrink-0 opacity-70" />
                  ) : (
                    <Tv size={14} className="shrink-0 opacity-70" />
                  )}
                  <span className="truncate">{c.name}</span>
                </button>
                <button
                  onClick={() => removeChannel(c.id)}
                  title="Remover canal"
                  className="text-slate-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-slate-600">
            Adicione apenas playlists e fluxos com os quais tem autorização
            para trabalhar. Os canais ficam guardados neste dispositivo.
          </p>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-3">
          {status && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {status}
            </div>
          )}
          <Player
            channel={localFile ? null : selected}
            localFile={localFile}
            udpxy={udpxy}
            netMode={netMode}
            onStatus={handleStatus}
          />
        </section>
      </main>
    </div>
  );
}
