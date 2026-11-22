import { createIcon, createSpecGrid, formatBytes, formatNumber } from "../renderer/spec-view.js";

export function cpuTemplate(systemInfo, showSummary = false) {
  const { cpu } = systemInfo;
  const speed = formatNumber(cpu.speed || null, "GHz");
  const grid = createSpecGrid([
    ["メーカー", cpu.manufacturer || "—"],
    ["モデル", cpu.brand || "—"],
    ["論理コア", cpu.cores],
    ["物理コア", cpu.physicalCores],
    ["クロック", speed],
    ["最大クロック", formatNumber(cpu.speedMax, "GHz")],
    ["ソケット", cpu.socket],
    ["L2 キャッシュ", formatBytes(cpu.cache?.l2, true)],
    ["L3 キャッシュ", formatBytes(cpu.cache?.l3, true)]
  ]);
  if (!showSummary) return grid;

  const layout = document.createElement("div");
  layout.className = "cpu-layout";
  const details = document.createElement("div");
  const detailsTitle = document.createElement("h3");
  detailsTitle.className = "section-title";
  detailsTitle.textContent = "基本情報";
  details.append(detailsTitle, grid);

  const overview = document.createElement("div");
  const overviewTitle = document.createElement("h3");
  overviewTitle.className = "section-title";
  overviewTitle.textContent = "CPU 概要";
  const card = document.createElement("div");
  card.className = "cpu-summary";
  const model = document.createElement("span");
  model.textContent = cpu.brand || "—";
  const cores = document.createElement("strong");
  cores.textContent = cpu.physicalCores > 0 ? `${cpu.physicalCores} コア` : "—";
  const clock = document.createElement("span");
  clock.textContent = `クロック ${speed}`;
  card.append(createIcon("cpu"), model, cores, clock);
  overview.append(overviewTitle, card);
  layout.append(details, overview);
  return layout;
}
