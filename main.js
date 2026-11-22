const { app, BrowserWindow, ipcMain, clipboard, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const si = require("systeminformation");
const { configureWindowSecurity, isTrustedIpcSender } = require("./services/window-security");
const { createHardwareService } = require("./services/hardware-service");
const { validateExportOptions, createReport } = require("./services/spec-export");

const entryPath = path.join(__dirname, "index.html");
const entryUrl = pathToFileURL(entryPath).href;
const { productName, version } = require("./package.json");
let mainWindow = null;
const hardware = createHardwareService(si);

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function configureStoragePaths() {
  const portableExecutableDirectory = process.env.PORTABLE_EXECUTABLE_DIR;
  const portableExecutableFile = process.env.PORTABLE_EXECUTABLE_FILE;
  const isPortable =
    process.platform === "win32" &&
    Boolean(portableExecutableDirectory) &&
    Boolean(portableExecutableFile);

  if (!isPortable) {
    const userData = path.join(app.getPath("appData"), productName);
    const legacyUserData = path.join(app.getPath("appData"), "PC Spec Tool");
    const dataPath = !fs.existsSync(userData) && fs.existsSync(legacyUserData) ? legacyUserData : userData;
    app.setPath("userData", dataPath);
    app.setPath("sessionData", dataPath);
    app.setAppLogsPath();

    return {
      mode: "installed",
      portableData: null,
      userData: app.getPath("userData"),
      sessionData: app.getPath("sessionData"),
      logs: app.getPath("logs"),
      cache: path.join(app.getPath("sessionData"), "Cache"),
      temp: app.getPath("temp"),
      crashDumps: app.getPath("crashDumps")
    };
  }

  const portableRoot = path.resolve(portableExecutableDirectory);
  const currentPortableData = path.join(portableRoot, "NexaSpec-Insight-PortableData");
  const legacyPortableData = path.join(portableRoot, "PC-Spec-Tool-PortableData");
  const portableData = !fs.existsSync(currentPortableData) && fs.existsSync(legacyPortableData)
    ? legacyPortableData : currentPortableData;
  const storagePaths = {
    mode: "portable",
    portableData,
    userData: path.join(portableData, "UserData"),
    sessionData: path.join(portableData, "SessionData"),
    logs: path.join(portableData, "Logs"),
    cache: path.join(portableData, "Cache"),
    temp: path.join(portableData, "Temp"),
    crashDumps: path.join(portableData, "CrashDumps")
  };

  for (const directoryPath of Object.values(storagePaths).filter(
    (value) => typeof value === "string" && path.isAbsolute(value)
  )) {
    ensureDirectory(directoryPath);
  }

  process.env.TEMP = storagePaths.temp;
  process.env.TMP = storagePaths.temp;

  app.setPath("userData", storagePaths.userData);
  app.setPath("sessionData", storagePaths.sessionData);
  app.setPath("temp", storagePaths.temp);
  app.setPath("crashDumps", storagePaths.crashDumps);
  app.setAppLogsPath(storagePaths.logs);
  app.commandLine.appendSwitch("disk-cache-dir", storagePaths.cache);

  return storagePaths;
}

// Electron/Chromiumの初期化前に保存先を確定する必要があるため、whenReadyより前に実行する。
const storagePaths = configureStoragePaths();

function writeStartupLog() {
  ensureDirectory(storagePaths.logs);
  fs.appendFileSync(
    path.join(storagePaths.logs, "nexaspec-insight.log"),
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...storagePaths
    })}\n`,
    "utf8"
  );
}

writeStartupLog();

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: "#edf2f9",
    title: productName,
    icon: path.join(__dirname, "assets", "nexaspec-insight.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      navigateOnDragDrop: false
    }
  });

  mainWindow = win;
  configureWindowSecurity(win);
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.loadFile(entryPath);
}

function assertTrusted(event) {
  if (!isTrustedIpcSender(event, mainWindow, entryUrl)) {
    throw new Error("許可されていない画面からの情報取得を拒否しました。");
  }
}

ipcMain.handle("get-system-info", (event, sections) => {
  assertTrusted(event);
  return hardware.collect(sections);
});

ipcMain.handle("get-app-info", (event) => {
  assertTrusted(event);
  return { name: productName, version };
});

ipcMain.handle("copy-system-info", (event, options) => {
  assertTrusted(event);
  const settings = validateExportOptions(options, false);
  clipboard.writeText(createReport(hardware.snapshot(), settings, version));
  return { copied: true };
});

ipcMain.handle("save-system-info", async (event, options) => {
  assertTrusted(event);
  const settings = validateExportOptions(options);
  const report = createReport(hardware.snapshot(), settings, version);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "PCスペックを保存", buttonLabel: "保存",
    defaultPath: `NexaSpec-Insight-${new Date().toISOString().slice(0, 10)}.${settings.format}`,
    filters: [{ name: settings.format === "json" ? "JSON" : "テキスト", extensions: [settings.format] }]
  });
  if (canceled || !filePath) return { canceled: true };
  assertTrusted(event);
  if (path.extname(filePath).toLowerCase() !== `.${settings.format}`) {
    throw new Error(`保存先の拡張子を .${settings.format} にしてください。`);
  }
  await fs.promises.writeFile(filePath, report, "utf8");
  return { canceled: false, fileName: path.basename(filePath) };
});

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
