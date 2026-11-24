import { createMessage, createCardGroup, createCard, formatNumber } from "../renderer/spec-view.js";

export function gpuTemplate(systemInfo) {
  const { controllers = [], displays = [] } = systemInfo.graphics;
  const view = document.createDocumentFragment();
  const gpus = controllers.map((gpu, index) => {
    const rows = [
      ["メーカー", gpu.vendor || "—"],
      ["VRAM", formatNumber(gpu.vram, "MB")],
      ["接続", gpu.bus || "—"],
      ["ドライバー", gpu.driverVersion || "—"],
      ["ドライバー日付", gpu.driverDate]
    ];
    if (Number.isFinite(gpu.temperatureGpu)) rows.push(["温度", formatNumber(gpu.temperatureGpu, "°C")]);
    if (Number.isFinite(gpu.powerDraw)) rows.push(["消費電力", formatNumber(gpu.powerDraw, "W")]);
    return createCard(gpu.model || `GPU ${index + 1}`, rows);
  });
  view.append(gpus.length ? createCardGroup("GPU", gpus) : createMessage("GPU情報を取得できませんでした。"));

  const monitors = displays.map((display, index) => createCard(display.model || `ディスプレイ ${index + 1}`, [
    ["メーカー", display.vendor],
    ["現在の解像度", display.currentResX && display.currentResY ? `${display.currentResX} × ${display.currentResY}` : "—"],
    ["リフレッシュレート", formatNumber(display.currentRefreshRate, "Hz")],
    ["接続方式", display.connection],
    ["メイン画面", typeof display.main === "boolean" ? (display.main ? "はい" : "いいえ") : "—"]
  ]));
  view.append(monitors.length ? createCardGroup("ディスプレイ", monitors) : createMessage("ディスプレイ情報を取得できませんでした。"));
  return view;
}
