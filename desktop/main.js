const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width:  1440,
    height: 900,
    minWidth:  1100,
    minHeight: 700,
    titleBarStyle: "hiddenInset",   // barre macOS native intégrée
    backgroundColor: "#0d0d0f",    // évite le flash blanc au démarrage
    webPreferences: {
      preload:          path.join(__dirname, "preload.js"),
      contextIsolation: true,
      // fetch() vers localhost:8000 autorisé (pas de webSecurity=false nécessaire)
    },
  });

  win.loadFile(path.join(__dirname, "src", "index.html"));

  // Ouvre les liens externes dans le navigateur système
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
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
