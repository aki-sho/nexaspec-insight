import { createMessage, createCardGroup, createCard, formatBytes, formatNumber } from "../renderer/spec-view.js";

const driveTypes = ["—", "ルートなし", "リムーバブル", "固定", "ネットワーク", "光学", "RAM ディスク"];

export function storageTemplate(systemInfo) {
  const { disks = [], volumes = [] } = systemInfo.storage;
  const view = document.createDocumentFragment();
  const diskCards = disks.map((disk, index) => {
    const rows = [
      ["種類", disk.type || "—"],
      ["容量", formatBytes(disk.size)],
      ["接続", disk.interfaceType || "—"],
      ["ファームウェア", disk.firmwareRevision],
      ["セクターサイズ", formatNumber(disk.bytesPerSector, "B")]
    ];
    if (disk.healthStatus) rows.push(["ディスク状態", disk.healthStatus]);
    if (typeof disk.smartPassed === "boolean") rows.push(["S.M.A.R.T. 判定", disk.smartPassed ? "正常" : "異常"]);
    if (Number.isFinite(disk.temperature)) rows.push(["温度", formatNumber(disk.temperature, "°C")]);
    if (Number.isFinite(disk.powerOnHours)) rows.push(["通電時間", formatNumber(disk.powerOnHours, "時間")]);
    if (Number.isFinite(disk.nvmePercentageUsed)) rows.push(["NVMe 耐久性消費率", formatNumber(disk.nvmePercentageUsed, "%")]);
    return createCard(disk.name || disk.model || `ディスク ${index + 1}`, rows);
  });
  view.append(diskCards.length ? createCardGroup("物理ディスク", diskCards) : createMessage("物理ディスク情報を取得できませんでした。"));

  const volumeCards = volumes.map((volume) => {
    const card = createCard(volume.mount || volume.fs || "ボリューム", [
      ["ボリューム名", volume.label],
      ["ドライブ種別", driveTypes[volume.driveType]],
      ["ファイルシステム", volume.type || "—"],
      ["容量", formatBytes(volume.size)],
      ["使用済み", formatBytes(volume.used)],
      ["空き容量", formatBytes(volume.available)]
    ]);
    if (Number.isFinite(volume.use)) {
      const progress = document.createElement("progress");
      progress.max = 100;
      progress.value = Math.max(0, Math.min(100, volume.use));
      progress.setAttribute("aria-label", `${volume.mount || volume.fs} 使用率 ${progress.value}%`);
      card.append(progress);
    }
    return card;
  });
  view.append(volumeCards.length ? createCardGroup("ボリューム", volumeCards) : createMessage("ボリューム情報を取得できませんでした。"));
  return view;
}
