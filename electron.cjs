const { app, BrowserWindow, ipcMain, session, shell } = require("electron");
const path = require("path");

const DIST = path.join(__dirname, "dist");

/**
 * Proxy da rede (modem WiFi corporativo/hotel, proxy partilhado, etc.).
 * Aplica-se a toda a sessão: manifests HLS, segmentos, fluxos MPEG-TS
 * e reprodução <video> passam por este proxy.
 */
ipcMain.handle("net:set-proxy", (_event, rules) => {
  const value = typeof rules === "string" ? rules.trim() : "";
  if (!value) {
    return session.defaultSession.setProxy({ proxyRules: "direct://" });
  }
  return session.defaultSession.setProxy({ proxyRules: value });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: "#05070d",
    autoHideMenuBar: true,
    title: "Signal TV",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadFile(path.join(DIST, "index.html"));

  // Ligações externas abrem no navegador do sistema, nunca numa janela Electron.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
