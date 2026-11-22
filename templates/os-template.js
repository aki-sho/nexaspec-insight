import { createSpecGrid, formatDateTime } from "../renderer/spec-view.js";

function formatUptime(uptime) {
  if (!Number.isFinite(uptime) || uptime < 0) return "—";
  const minutes = Math.floor(uptime / 60);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  return `${days ? `${days}日 ` : ""}${hours}時間 ${minutes % 60}分`;
}

export function osTemplate(systemInfo) {
  const { os } = systemInfo;
  return createSpecGrid([
    ["OS", os.distro || "—"],
    ["表示バージョン", os.displayVersion],
    ["リリース", os.release || "—"],
    ["ビルド", os.build || "—"],
    ["アーキテクチャ", os.arch || "—"],
    ["インストール日", formatDateTime(os.installDate, true)],
    ["最終起動日時", formatDateTime(os.lastBootAt)],
    ["稼働時間", formatUptime(os.uptime)],
    ["起動モード", typeof os.uefi === "boolean" ? (os.uefi ? "UEFI" : "レガシー BIOS") : "—"]
  ]);
}
