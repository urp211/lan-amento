export interface M3UEntry {
  name: string;
  url: string;
}

/**
 * Analisa uma playlist M3U/M3U8 e devolve apenas entradas
 * http(s):// e udp:// — seguro para adicionar tudo à lista de canais.
 */
export function parseM3U(text: string): M3UEntry[] {
  const out: M3UEntry[] = [];
  const seen = new Set<string>();
  let pendingName: string | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;

    if (line.startsWith("#EXTINF")) {
      const comma = line.indexOf(",");
      pendingName = comma >= 0 ? line.slice(comma + 1).trim() : null;
      continue;
    }
    if (line.startsWith("#")) continue;

    if (!/^(https?|udp):\/\//i.test(line)) {
      pendingName = null;
      continue;
    }
    if (seen.has(line)) continue;
    seen.add(line);

    let name = pendingName ?? "";
    if (!name) {
      const base = line.split(/[?#]/)[0].split("/").filter(Boolean).pop();
      name = base ?? "Canal";
    }
    out.push({ name, url: line });
    pendingName = null;
  }

  return out;
}
