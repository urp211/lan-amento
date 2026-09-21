export type TestType = "bars" | "gray" | "snow";

export type NetMode = "auto" | "stable" | "economy";

export interface Channel {
  id: string;
  name: string;
  /** URL http(s)/udp:// para canais de streaming, ou "test:<type>" para sinais de teste. */
  url: string;
  kind: "stream" | "test";
  testType?: TestType;
}

export interface AppSettings {
  /** Regra de proxy do Chromium, ex.: "http://192.168.1.1:3128" ou "socks5://host:1080". */
  proxy: string;
  netMode: NetMode;
}

/** Ponte exposta pelo preload do Electron (inexistente no browser web). */
export interface SignalTVBridge {
  isDesktop: boolean;
  platform: string;
  setProxy(rules: string): Promise<{ ok: boolean; proxy: string }>;
}

declare global {
  interface Window {
    signalTV?: SignalTVBridge;
  }
}
