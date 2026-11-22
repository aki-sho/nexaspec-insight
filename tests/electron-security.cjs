const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, clipboard, dialog } = require("electron");
const appRoot = process.env.PC_SPEC_SECURITY_APP_ROOT || path.join(__dirname, "..");
const si = require(path.join(appRoot, "node_modules/systeminformation"));
const windows = require(path.join(appRoot, "services/powershell-runner.js"));
const readWindowsDetails = windows.readWindowsDetails;
let demoWindowsDetails;
const liveWindowsDetails = {};
windows.readWindowsDetails = async (section) => {
  if (demoWindowsDetails) return demoWindowsDetails[section];
  const query = readWindowsDetails(section);
  liveWindowsDetails[section] = query;
  return query;
};

if (!process.env.PC_SPEC_SECURITY_TEST_DIR) {
  throw new Error("Run this test with npm run test:security");
}

process.env.PORTABLE_EXECUTABLE_DIR = process.env.PC_SPEC_SECURITY_TEST_DIR;
process.env.PORTABLE_EXECUTABLE_FILE = path.join(process.env.PC_SPEC_SECURITY_TEST_DIR, "test.exe");
app.on("browser-window-created", (_event, win) => win.hide());
require(path.join(appRoot, "main.js"));

const payload = `<img src=x onerror="window.__pcSpecXss=true"> & " ' </div><script>window.__pcSpecXss=true</script>`;
const evaluate = (win, source) => win.webContents.executeJavaScript(source, true);

async function waitFor(win, condition) {
  await evaluate(win, `new Promise((resolve, reject) => {
    const deadline = Date.now() + 30000;
    const check = () => {
      if (${condition}) resolve();
      else if (Date.now() > deadline) reject(new Error('UI condition timed out'));
      else setTimeout(check, 25);
    };
    check();
  })`);
}

async function clickAndWait(win, selector, condition = "!document.querySelector('#refresh').disabled && !document.querySelector('#copy').disabled") {
  await evaluate(win, `document.querySelector(${JSON.stringify(selector)}).click()`);
  await waitFor(win, condition);
}

app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.setBackgroundThrottling(false);
  if (win.webContents.isLoading()) {
    await new Promise((resolve) => win.webContents.once("did-finish-load", resolve));
  }
  await waitFor(win, "!document.querySelector('#refresh').disabled && Boolean(document.querySelector('.overview-grid [data-section=cpu] .value'))");
  assert.equal(await evaluate(win, "document.querySelector('.tab[aria-selected=true]').dataset.tab"), "All");
  assert.equal(await evaluate(win, "document.querySelector('#tab-All').nextElementSibling.dataset.tab"), "CPU");
  const { productName, version } = require(path.join(appRoot, "package.json"));
  assert.equal(await evaluate(win, "document.title"), productName);
  assert.ok(await evaluate(win, "document.querySelector('.brand img').naturalWidth > 0"));
  if (process.platform === "win32") {
    const checks = {
      graphics: (details) => Array.isArray(details?.adapters),
      storage: (details) => Array.isArray(details?.volumes),
      os: (details) => Object.hasOwn(details || {}, "lastBootAt")
    };
    for (const [section, check] of Object.entries(checks)) {
      const query = liveWindowsDetails[section];
      assert.ok(query, `Windows query was not attempted: ${section}`);
      const details = await query.catch((error) => {
        if (process.env.PC_SPEC_TEST_ALLOW_MISSING_WINDOWS_DETAILS !== "1") throw error;
        console.log(`Optional Windows query unavailable on hosted runner: ${section} (${error.killed ? "timeout" : error.code || error.name})`);
        return undefined;
      });
      if (details !== undefined) assert.ok(check(details), `Invalid Windows query result: ${section}`);
    }
  }
  const entryUrl = win.webContents.getURL();
  const preferences = win.webContents.getLastWebPreferences();
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.webSecurity, true);
  assert.equal(await evaluate(win, "typeof require"), "undefined");
  assert.equal(await evaluate(win, "getComputedStyle(document.querySelector('.spec-grid')).display"), "grid");
  console.log(`PASS: Electron ${process.versions.electron}, real hardware IPC, Windows supplementary queries and local CSS`);

  if (process.env.PC_SPEC_TEST_SCREENSHOT) {
    fs.writeFileSync(process.env.PC_SPEC_TEST_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
  }

  for (const [tab, heading] of [["CPU", "プロセッサー"], ["Mainboard", "マザーボード"], ["Memory", "メモリ"],
    ["Graphics", "グラフィックス"], ["Storage", "ストレージ"], ["OS", "OS"], ["About", productName]]) {
    assert.equal(await evaluate(win, `(() => {
      document.querySelector('[data-tab="${tab}"]').click();
      return document.querySelector('.panel h2').textContent;
    })()`), heading);
  }
  console.log("PASS: brand assets load and all eight tabs render");

  const privateMarker = "DEMO-PRIVATE-SERIAL";
  const calls = {};
  const demo = {
    cpu: { manufacturer: "AMD", brand: "Ryzen 9 9900X", cores: 24, physicalCores: 12, speed: 4.4,
      speedMax: 5.6, socket: "AM5", cache: { l2: 12 * 1024 ** 2, l3: 64 * 1024 ** 2 } },
    baseboard: { manufacturer: "ASUS", model: "ROG STRIX X870-F", version: "Rev 1.xx", serial: privateMarker,
      memSlots: 4, memMax: 192 * 1024 ** 3 },
    bios: { vendor: "American Megatrends", version: "2102", releaseDate: "2025-10-16" },
    mem: { total: 32 * 1024 ** 3, active: 12 * 1024 ** 3, available: 20 * 1024 ** 3 },
    memLayout: [0, 1].map(index => ({ bank: `DIMM ${index + 1}`, size: 16 * 1024 ** 3, type: "DDR5",
      clockSpeed: 6000, manufacturer: "Kingston", partNum: "KF560C30-16", serialNum: privateMarker,
      formFactor: "DIMM", voltageConfigured: 1.35 })),
    graphics: {
      controllers: [
        { vendor: "NVIDIA", model: "GeForce RTX 5070", vram: 12288, bus: "PCIe", driverVersion: "581.80",
          temperatureGpu: 42, powerDraw: 32.5 },
        { vendor: "AMD", model: "Radeon Graphics", vram: 512, bus: "PCIe", driverVersion: "32.0.12033" }
      ],
      displays: [
        { vendor: "Dell", model: "Dell U2724D", currentResX: 2560, currentResY: 1440,
          currentRefreshRate: 120, connection: "DisplayPort", main: true }
      ]
    },
    diskLayout: [
      { name: "Samsung SSD 990 PRO 1TB", type: "SSD", size: 10 ** 12, interfaceType: "NVMe", serialNum: privateMarker,
        firmwareRevision: "7B2QJXD7", bytesPerSector: 512, smartStatus: "Ok", temperature: 38,
        smartData: { smart_status: { passed: true }, power_on_time: { hours: 730 }, nvme_smart_health_information_log: { percentage_used: 2 } } },
      { name: "WD Blue 2TB", type: "HD", size: 2 * 10 ** 12, interfaceType: "SATA", serialNum: privateMarker }
    ],
    fsSize: [{ mount: "C:", fs: "C:", type: "NTFS", size: 10 ** 12, used: 382 * 10 ** 9, available: 618 * 10 ** 9, use: 38.2 }, { mount: "D:", fs: "D:", type: "NTFS", size: 2 * 10 ** 12, used: 5 * 10 ** 11, available: 1.5 * 10 ** 12, use: 25 }],
    osInfo: { distro: "Microsoft Windows 11 Pro", release: "10.0.26200", build: "26200", arch: "x64", uefi: true },
    time: { uptime: 92000 }
  };
  demoWindowsDetails = {
    graphics: { adapters: [{ Name: "GeForce RTX 5070", DriverVersion: "581.80", DriverDate: "2025-11-10" }] },
    storage: { volumes: [{ DeviceID: "C:", VolumeName: "Windows", DriveType: 3 }, { DeviceID: "D:", VolumeName: "Data", DriveType: 3 }] },
    os: { displayVersion: "25H2", installDate: "2025-11-09T01:00:00Z", lastBootAt: "2026-11-14T01:10:00Z" },
    firmware: { type: "Uefi" }
  };
  for (const [key, value] of Object.entries(demo)) si[key] = async () => { calls[key] = (calls[key] || 0) + 1; return value; };
  await clickAndWait(win, "#refresh");
  assert.equal(await evaluate(win, "document.querySelector('#include-serial').checked"), false);
  assert.equal(await evaluate(win, "document.querySelector('#app-version').textContent"), "v" + version);
  for (const [tab, count] of [["Graphics", 3], ["Memory", 2], ["Storage", 4]]) {
    await evaluate(win, `document.querySelector('[data-tab="${tab}"]').click()`);
    assert.equal(await evaluate(win, "document.querySelectorAll('.panel .spec-card').length"), count, tab);
  }
  assert.ok(await evaluate(win, "document.querySelector('.panel').textContent.includes('618 GB')"));

  await evaluate(win, "document.querySelector('#tab-All').click()");
  const summaryValues = await evaluate(win, "[...document.querySelectorAll('.summary-card strong')].map(card => card.textContent)");
  assert.deepEqual(summaryValues, ["Ryzen 9 9900X", "GeForce RTX 5070", "32 GiB", "物理ディスク 2 台", "Microsoft Windows 11 Pro"]);
  await evaluate(win, "document.querySelector('.summary-card').click()");
  assert.equal(await evaluate(win, "document.querySelector('.tab[aria-selected=true]').dataset.tab"), "CPU");
  assert.equal(await evaluate(win, "document.querySelector('.cpu-summary strong').textContent"), "12 コア");
  assert.equal(await evaluate(win, "document.activeElement.id"), "spec-panel");
  await evaluate(win, "document.querySelector('#tab-All').click()");
  const overview = await evaluate(win, `[...document.querySelectorAll('.overview-grid .category')].map(section => ({
    key: section.dataset.section, text: section.textContent, updatedAt: section.querySelector('time').dateTime
  }))`);
  assert.deepEqual(overview.map((section) => section.key), ["cpu", "mainboard", "memory", "graphics", "storage", "os"]);
  const expected = {
    cpu: ["AM5", "5.6 GHz", "64 MiB"],
    mainboard: ["American Megatrends", "2102", "192 GiB"],
    memory: ["20 GiB", "DIMM", "1.35 V"],
    graphics: ["GeForce RTX 5070", "Radeon Graphics", "Dell U2724D", "2560 × 1440", "120 Hz", "2025-11-10", "42 °C", "32.5 W"],
    storage: ["618 GB", "7B2QJXD7", "512 B", "S.M.A.R.T. 判定", "730 時間", "2 %"],
    os: ["25H2", "UEFI", "インストール日", "最終起動日時", "1日 1時間 33分"]
  };
  for (const section of overview) {
    assert.ok(Number.isFinite(Date.parse(section.updatedAt)), section.key);
    assert.ok(section.text.includes("取得済み"), section.key);
    for (const value of expected[section.key]) assert.ok(section.text.includes(value), `${section.key}: ${value}`);
  }
  assert.equal(await evaluate(win, `(() => {
    document.querySelector('#tab-All').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    return document.activeElement.dataset.tab;
  })()`), "CPU");
  await evaluate(win, "document.activeElement.blur()");
  console.log("PASS: six sections share complete details and acquisition status in the overview");

  let copied = "";
  clipboard.writeText = text => { copied = text; };
  await clickAndWait(win, "#copy");
  assert.ok(copied.startsWith(`${productName} / System report`));
  assert.ok(copied.includes("Ryzen 9 9900X"));
  assert.ok(copied.includes("driverDate: 2025-11-10"));
  assert.ok(!copied.includes(privateMarker));
  await evaluate(win, "document.querySelector('#include-serial').checked = true");
  await clickAndWait(win, "#copy");
  assert.ok(copied.includes(privateMarker));
  await evaluate(win, "document.querySelector('#include-serial').checked = false");
  for (const format of ["txt", "json"]) {
    const filePath = path.join(process.env.PC_SPEC_SECURITY_TEST_DIR, `report.${format}`);
    dialog.showSaveDialog = async (_owner, options) => {
      assert.deepEqual(options.filters[0].extensions, [format]);
      return { canceled: false, filePath };
    };
    await evaluate(win, `document.querySelector('#export-format').value = '${format}'`);
    await clickAndWait(win, "#save");
    const contents = fs.readFileSync(filePath, "utf8");
    assert.ok(contents.includes("Ryzen 9 9900X"));
    assert.ok(!contents.includes(privateMarker));
    if (format === "json") {
      const report = JSON.parse(contents);
      assert.equal(report.application, productName);
      assert.equal(report.storage.volumes[0].available, 618 * 10 ** 9);
      assert.equal(report.graphics.displays[0].model, "Dell U2724D");
      assert.equal(report.os.displayVersion, "25H2");
    }
  }
  dialog.showSaveDialog = async () => ({ canceled: true });
  await clickAndWait(win, "#save");
  assert.ok(await evaluate(win, "document.querySelector('#notice').textContent.includes('キャンセル')"));
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(process.env.PC_SPEC_SECURITY_TEST_DIR, "invalid.exe") });
  await clickAndWait(win, "#save");
  assert.equal(fs.existsSync(path.join(process.env.PC_SPEC_SECURITY_TEST_DIR, "invalid.exe")), false);
  assert.ok(await evaluate(win, "document.querySelector('#notice').textContent.includes('拡張子')"));
  console.log("PASS: copy, TXT/JSON writes, default serial redaction, explicit inclusion, cancellation and extension checks");

  assert.ok(await evaluate(win, "!document.querySelector('#notice').textContent.includes('remote method')"));
  await evaluate(win, "document.querySelector('#export-format').value = 'txt'");
  await clickAndWait(win, "#refresh");

  if (process.env.PC_SPEC_TEST_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.PC_SPEC_TEST_SCREENSHOT_DIR, { recursive: true });
  }
  for (const size of [[1180, 820], [860, 620]]) {
    win.setSize(...size);
    for (const tab of ["All", "CPU", "Mainboard", "Graphics", "Memory", "Storage", "OS"]) {
      await evaluate(win, `document.querySelector('[data-tab="${tab}"]').click(); document.querySelector('.content').scrollTop = 0`);
      await evaluate(win, "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      assert.ok(await evaluate(win, "document.documentElement.scrollWidth <= innerWidth && document.querySelector('.panel').scrollWidth <= document.querySelector('.panel').clientWidth"), `${tab} at ${size}`);
      assert.ok(await evaluate(win, "document.querySelector('#save').getBoundingClientRect().bottom <= innerHeight"));
      if (process.env.PC_SPEC_TEST_SCREENSHOT_DIR) {
        fs.writeFileSync(path.join(process.env.PC_SPEC_TEST_SCREENSHOT_DIR, `${tab}-${size[0]}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
  }
  win.setSize(1180, 820);
  console.log("PASS: desktop and minimum-size layouts, all panels and export controls remain accessible");

  const results = await evaluate(win, `(async () => {
    const payload = ${JSON.stringify(payload)};
    const fixture = {
      cpu: { manufacturer: payload, brand: payload, cores: payload, physicalCores: payload, speed: payload },
      memory: { totalGB: payload },
      mainboard: { manufacturer: payload, model: payload, version: payload, serial: payload },
      os: { distro: payload, release: payload, build: payload, arch: payload },
      graphics: { controllers: [{ model: payload, vendor: payload, vram: payload, bus: payload }] },
      storage: { disks: [{ name: payload, size: 1024 }, { model: payload }] }
    };
    const panel = document.querySelector('.panel');
    const results = [];
    for (const [name, fn] of [
      ['cpu', 'cpuTemplate'], ['gpu', 'gpuTemplate'], ['memory', 'memoryTemplate'],
      ['motherboard', 'motherboardTemplate'], ['os', 'osTemplate'], ['storage', 'storageTemplate']
    ]) {
      const module = await import(new URL('./templates/' + name + '-template.js', location.href).href);
      panel.replaceChildren(module[fn](fixture));
      results.push({ name, literal: panel.textContent.includes(payload),
        injected: Boolean(panel.querySelector('img, script, iframe')) });
    }
    const { createMessage } = await import(new URL('./renderer/spec-view.js', location.href).href);
    panel.replaceChildren(createMessage(payload));
    results.push({ name: 'message', literal: panel.querySelector('p').textContent === payload,
      injected: Boolean(panel.querySelector('img, script, iframe')) });
    return results;
  })()`);
  for (const result of results) {
    assert.equal(result.literal, true, result.name);
    assert.equal(result.injected, false, result.name);
  }
  assert.equal(await evaluate(win, "window.__pcSpecXss"), undefined);
  console.log("PASS: hostile markup stays literal in all six templates and messages");

  const originalCpu = si.cpu;
  si.cpu = async () => { throw new Error(payload); };
  win.webContents.reload();
  await new Promise((resolve) => win.webContents.once("did-finish-load", resolve));
  await waitFor(win, "!document.querySelector('#refresh').disabled && Boolean(document.querySelector('.error-banner'))");
  assert.equal(await evaluate(win, `document.querySelector('.panel').textContent.includes(${JSON.stringify(payload)})`), false);
  assert.equal(await evaluate(win, "Boolean(document.querySelector('.panel img, .panel script'))"), false);
  assert.equal(await evaluate(win, "document.querySelector('[data-section=cpu] .category-state').textContent"), "更新失敗・前回の値");
  assert.equal(await evaluate(win, "document.querySelector('[data-section=memory] .category-state').textContent"), "取得済み");
  si.cpu = originalCpu;
  const memoryCalls = calls.mem;
  await clickAndWait(win, ".retry-section");
  assert.equal(await evaluate(win, "Boolean(document.querySelector('.error-banner'))"), false);
  assert.equal(calls.mem, memoryCalls);
  assert.equal(await evaluate(win, "document.querySelector('#retry-failed').hidden"), true);
  console.log("PASS: partial collection failure preserves other tabs; targeted retry recovers without fetching unrelated hardware");

  const csp = await evaluate(win, `(async () => {
    window.__cspInline = false;
    const directives = [];
    document.addEventListener('securitypolicyviolation', event => directives.push(event.effectiveDirective));
    const script = document.createElement('script');
    script.textContent = 'window.__cspInline = true';
    document.body.append(script);
    let fetchBlocked = false;
    try { await fetch('data:text/plain,blocked'); } catch { fetchBlocked = true; }
    const frame = document.createElement('iframe');
    frame.src = 'data:text/html,blocked';
    document.body.append(frame);
    await new Promise(resolve => setTimeout(resolve, 100));
    script.remove();
    frame.remove();
    return { inlineBlocked: !window.__cspInline, fetchBlocked, directives };
  })()`);
  assert.equal(csp.inlineBlocked, true);
  assert.equal(csp.fetchBlocked, true);
  assert.ok(csp.directives.includes("script-src-elem"));
  assert.ok(csp.directives.includes("connect-src"));
  assert.ok(csp.directives.includes("frame-src"));
  console.log("PASS: CSP blocks inline JavaScript, connections and embedded frames");

  const count = BrowserWindow.getAllWindows().length;
  assert.equal(await evaluate(win, "window.open('https://example.invalid/blocked') === null"), true);
  assert.equal(BrowserWindow.getAllWindows().length, count);
  const navigation = new Promise((resolve) => {
    win.webContents.once("will-frame-navigate", (event) => resolve(event.defaultPrevented));
  });
  await evaluate(win, "location.href = 'https://example.invalid/blocked'; undefined");
  assert.equal(await navigation, true);
  assert.equal(win.webContents.getURL(), entryUrl);
  console.log("PASS: external navigation and new windows are blocked");

  const untrusted = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(appRoot, "preload.js"), sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  await untrusted.loadFile(path.join(appRoot, "index.html"));
  const rejected = "window.pcInfo.getSystemInfo().then(() => false, error => error.message.includes('情報取得を拒否'))";
  assert.equal(await evaluate(untrusted, rejected), true);
  const deniedExports = `Promise.all([
    window.pcInfo.getAppInfo(), window.pcInfo.copySpecs({includeSerial:false}),
    window.pcInfo.saveSpecs({format:'txt',includeSerial:false})
  ].map(promise => promise.then(() => false, () => true)))`;
  assert.deepEqual(await evaluate(untrusted, deniedExports), [true, true, true]);
  untrusted.destroy();
  // Main-process navigation intentionally bypasses will-navigate, exercising the IPC guard independently.
  await win.loadURL("data:text/html,<title>untrusted</title>");
  assert.equal(await evaluate(win, rejected), true);
  console.log("PASS: IPC rejects another window and a navigated main window");
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

setTimeout(() => {
  console.error("Security integration test timed out");
  app.exit(1);
}, 90000).unref();
