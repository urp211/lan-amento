# Signal TV

Player IPTV para a **sua rede local (LAN)** — sem precisar de plano de internet.

- Fluxos multicast UDP (`udp://...`) através de um servidor [udpxy](https://github.com/GarvinHicks/udpxy)
- Fluxos HLS (`.m3u8`) e MPEG-TS (`.ts`) por HTTP
- **Reprodução estável em qualquer plano de internet**: reconexão automática
  (backoff), recuperação de erros de media e modos Auto / Estável / Economia
  (buffer e bitrate ajustados à ligação)
- **Proxy do modem** (`http://` ou `socks5://`) aplicado a todos os fluxos na
  versão desktop
- **Antena parabólica/terrestre (DVB-S/S2, DVB-T/T2)** via ponte de rede
  (VLC HTTP ou tvheadend num PC da casa) — botão "Adicionar canal da antena"
- Importação de playlists **M3U/M3U8**
- Ficheiros de vídeo locais
- Sinais de teste gerados no aparelho (barras de cor, cinza 75%, ruído)
- Gravação do sinal visível (guarda `.webm` nos descarregamentos)

Stack: React + Vite + Tailwind + Electron (empacotado com electron-builder).

## Gerar o EXE para Windows (GitHub Actions)

1. Crie um repositório vazio no GitHub.
2. Envie **todos** os ficheiros deste projeto, incluindo `.github/workflows/build-windows.yml`.
3. No GitHub, abra o separador **Actions** → **Build Signal TV for Windows** → **Run workflow**.
4. No fim, baixe o artifact **`signal-tv-windows-build.zip`** na execução concluída.
5. Dentro dele estão o instalador NSIS e o EXE portável.

O seu PC **não precisa de Node.js** — a compilação ocorre nos servidores do GitHub.
Detalhes em [`GITHUB-ACTIONS-GUIDE-PT.txt`](./GITHUB-ACTIONS-GUIDE-PT.txt).

## Compilar localmente (opcional)

Num computador Windows:

```bash
npm install
npm run dist:win
```

Os EXEs ficam na pasta `release/`.

## Notas importantes

- Este pacote **não inclui canais nem streams**. Adicione apenas playlists e
  fluxos com os quais tem autorização para trabalhar.
- Para fluxos `udp://`, execute um servidor `udpxy` num PC da mesma rede e
  indique o seu endereço em **Definições → udpxy** (ex.: `192.168.1.10:4022`).
- Aplicações Electron consomem mais RAM do que uma página de browser. Em PCs
  fracos, prefira a versão portável e feche outros programas.
