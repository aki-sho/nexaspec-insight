import { createSpecGrid, formatBytes } from "../renderer/spec-view.js";

export function motherboardTemplate(systemInfo) {
  const { mainboard } = systemInfo;
  return createSpecGrid([
    ["メーカー", mainboard.manufacturer || "—"],
    ["モデル", mainboard.model || "—"],
    ["リビジョン", mainboard.version || "—"],
    ["シリアル番号", mainboard.serial || "—"],
    ["BIOS メーカー", mainboard.bios?.vendor],
    ["BIOS バージョン", mainboard.bios?.version],
    ["BIOS 公開日", mainboard.bios?.releaseDate],
    ["メモリスロット総数", mainboard.memSlots],
    ["最大メモリ容量", formatBytes(mainboard.memMax, true)]
  ]);
}
