import { get, set } from "idb-keyval";
import type { AppSettings, Channel } from "../types";

const CHANNELS_KEY = "signal-tv:channels";
const UDXPY_KEY = "signal-tv:udpxy";
const SETTINGS_KEY = "signal-tv:settings";

export async function loadChannels(): Promise<Channel[] | undefined> {
  try {
    return await get<Channel[]>(CHANNELS_KEY);
  } catch {
    return undefined;
  }
}

export async function saveChannels(channels: Channel[]): Promise<void> {
  try {
    await set(CHANNELS_KEY, channels);
  } catch {
    /* armazenamento indisponível (modo privado) — ignorar */
  }
}

export async function loadUdpxy(): Promise<string> {
  try {
    return (await get<string>(UDXPY_KEY)) ?? "";
  } catch {
    return "";
  }
}

export async function saveUdpxy(value: string): Promise<void> {
  try {
    await set(UDXPY_KEY, value);
  } catch {
    /* ignorar */
  }
}

export async function loadSettings(): Promise<AppSettings | undefined> {
  try {
    return await get<AppSettings>(SETTINGS_KEY);
  } catch {
    return undefined;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await set(SETTINGS_KEY, settings);
  } catch {
    /* ignorar */
  }
}
