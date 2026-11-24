import { createSpecGrid, formatBytes, formatNumber } from "../renderer/spec-view.js";

export function cpuTemplate(systemInfo) {
  const { cpu } = systemInfo;
  return createSpecGrid([
    ["メーカー", cpu.manufacturer || "—"],
    ["モデル", cpu.brand || "—"],
    ["論理コア", cpu.cores],
    ["物理コア", cpu.physicalCores],
    ["クロック", formatNumber(cpu.speed || null, "GHz")],
    ["最大クロック", formatNumber(cpu.speedMax, "GHz")],
    ["ソケット", cpu.socket],
    ["L2 キャッシュ", formatBytes(cpu.cache?.l2, true)],
    ["L3 キャッシュ", formatBytes(cpu.cache?.l3, true)]
  ]);
}
