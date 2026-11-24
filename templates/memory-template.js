import { createMessage, createSpecGrid, createCardGroup, createCard, formatBytes, formatNumber } from "../renderer/spec-view.js";

export function memoryTemplate(systemInfo) {
  const { memory } = systemInfo;
  const modules = memory.modules || [];
  const view = document.createDocumentFragment();
  view.append(createSpecGrid([
    ["総容量", memory.total ? formatBytes(memory.total, true) : `${memory.totalGB || "—"} GB`],
    ["使用中", formatBytes(memory.used, true)],
    ["利用可能", formatBytes(memory.available, true)],
    ["検出モジュール数", modules.length ? `${modules.length} 枚` : "—"]
  ]));
  const cards = modules.map((item, index) => createCard(item.bank || `モジュール ${index + 1}`, [
    ["容量", formatBytes(item.size, true)],
    ["規格", item.type || "—"],
    ["速度", formatNumber(item.clockSpeed || null, "MHz")],
    ["メーカー", item.manufacturer || "—"],
    ["型番", item.partNum || "—"],
    ["形状", item.formFactor],
    ["設定電圧", formatNumber(item.voltageConfigured, "V")]
  ]));
  view.append(cards.length ? createCardGroup("モジュール", cards) : createMessage("モジュール情報を取得できませんでした。"));
  return view;
}
