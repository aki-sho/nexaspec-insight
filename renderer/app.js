import { cpuTemplate } from "../templates/cpu-template.js";
import { gpuTemplate } from "../templates/gpu-template.js";
import { memoryTemplate } from "../templates/memory-template.js";
import { motherboardTemplate } from "../templates/motherboard-template.js";
import { osTemplate } from "../templates/os-template.js";
import { storageTemplate } from "../templates/storage-template.js";
import { createIcon, createMessage, formatBytes, formatDateTime } from "./spec-view.js";

const tabs = [
  { id: "CPU", key: "cpu", label: "CPU", title: "CPU の基本情報", template: cpuTemplate },
  { id: "Mainboard", key: "mainboard", label: "マザーボード", template: motherboardTemplate },
  { id: "Memory", key: "memory", label: "メモリ", template: memoryTemplate },
  { id: "Graphics", key: "graphics", label: "グラフィックス", template: gpuTemplate },
  { id: "Storage", key: "storage", label: "ストレージ", template: storageTemplate },
  { id: "OS", key: "os", label: "OS", title: "OS の基本情報", template: osTemplate }
];
let systemInfo = null;
let activeTab = "All";
let pendingSections = null;
let collectionFailed = false;
let exporting = false;
let appInfo = null;
const panel = document.querySelector(".panel");
const notice = document.querySelector("#notice");
const tabButtons = [...document.querySelectorAll(".tab")];
const content = document.querySelector(".content");

function announce(message, error = false) {
  notice.textContent = message;
  notice.classList.toggle("is-error", error);
}

function errorMessage(error, fallback) {
  return String(error?.message || fallback).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

function setControls() {
  const busy = Boolean(pendingSections) || exporting;
  const canExport = tabs.some(({ key }) => systemInfo?.[key]);
  document.querySelector("#refresh").disabled = busy;
  document.querySelector("#refresh-label").textContent = pendingSections ? "取得中…" : "すべて更新";
  for (const element of document.querySelectorAll(".export-control")) {
    element.disabled = busy || !canExport;
  }
  document.querySelector("#retry-failed").hidden = !Object.values(systemInfo?.sections || {}).some((item) => item.state === "error");
  document.querySelector("#retry-failed").disabled = busy;
  for (const button of panel.querySelectorAll(".retry-section")) button.disabled = busy;
}

function updateStatus() {
  const failed = Object.values(systemInfo?.sections || {}).filter((item) => item.state === "error").length;
  const stamp = document.querySelector("#last-updated");
  stamp.hidden = !systemInfo?.capturedAt;
  if (systemInfo?.capturedAt) {
    stamp.dateTime = systemInfo.capturedAt;
    stamp.textContent = `最終確認 ${formatDateTime(systemInfo.capturedAt)}`;
  }
  let state = systemInfo ? "ok" : "idle";
  let label = systemInfo ? "取得完了" : "未取得";
  if (pendingSections) {
    state = "busy";
    label = "取得中";
  } else if (collectionFailed || failed) {
    state = "error";
    label = collectionFailed ? "取得失敗" : `${failed} 項目で取得失敗`;
  }
  document.querySelector(".system-status").dataset.state = state;
  document.querySelector("#system-state").textContent = label;
}

function renderSection({ label, key, template }, overview = false) {
  const section = document.createElement("section");
  section.className = "category";
  section.dataset.section = key;

  const header = document.createElement("header");
  header.className = "category-header";
  const title = document.createElement(overview ? "h3" : "h2");
  title.textContent = key === "cpu" && !overview ? "プロセッサー" : label;
  const meta = document.createElement("div");
  meta.className = "category-meta";
  const state = document.createElement("span");
  state.className = "category-state";
  const status = systemInfo?.sections?.[key];
  const hasData = Boolean(systemInfo?.[key]);
  const refreshing = pendingSections?.includes(key);
  const failed = status?.state === "error";
  if (refreshing) {
    state.textContent = "取得中";
  } else if (failed) {
    state.textContent = hasData ? "更新失敗・前回の値" : "取得失敗";
    state.classList.add("warning");
  } else {
    state.textContent = status?.state === "ok" ? "取得済み" : "未取得";
    state.classList.toggle("success", status?.state === "ok");
  }
  meta.append(state);
  if (status?.updatedAt) {
    const time = document.createElement("time");
    time.dateTime = status.updatedAt;
    time.textContent = `最終取得 ${formatDateTime(status.updatedAt)}`;
    meta.append(time);
  }
  header.append(title, meta);
  section.append(header);

  if (failed && !refreshing) {
    const banner = document.createElement("div");
    banner.className = "error-banner";
    const message = document.createElement("span");
    message.textContent = hasData ? "前回の取得結果を表示しています。" : status.error;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button small retry-section";
    retry.textContent = "再試行";
    retry.setAttribute("aria-label", `${label}を再取得`);
    retry.disabled = Boolean(pendingSections) || exporting;
    retry.addEventListener("click", () => refresh([key]));
    banner.append(message, retry);
    section.append(banner);
  }
  if (hasData) {
    section.append(template(systemInfo, !overview));
  } else if (!failed || refreshing) {
    section.append(createMessage(refreshing ? "読み込み中です…" : "情報はまだ取得されていません。"));
  }
  return section;
}

function summaryCards(ids) {
  const { cpu, graphics, memory, storage, os, sections } = systemInfo || {};
  const gpuModels = graphics?.controllers || [];
  const diskCount = storage?.disks?.length;
  const cVolume = storage?.volumes?.find(({ mount }) => /^c:[\\/]*$/i.test(mount || ""));
  const summaries = {
    CPU: [cpu?.brand, cpu?.physicalCores > 0 ? `物理 ${cpu.physicalCores} コア` : null],
    Graphics: [gpuModels.find(({ model }) => model)?.model, gpuModels.length > 1 ? `GPU ${gpuModels.length} 台` : null],
    Memory: [memory?.total > 0 ? formatBytes(memory.total, true) : null, memory?.modules?.length ? `モジュール ${memory.modules.length} 枚` : null],
    Storage: [diskCount ? `物理ディスク ${diskCount} 台` : null, cVolume?.available != null ? `C: 空き ${formatBytes(cVolume.available)}` : null],
    OS: [os?.distro, [os?.displayVersion, os?.arch].filter(Boolean).join(" · ")]
  };
  const list = document.createElement("div");
  list.className = "summary-grid";

  for (const id of ids) {
    const { label, key } = tabs.find((tab) => tab.id === id);
    const [value, detail] = summaries[id];
    const card = document.createElement("button");
    card.className = "summary-card";
    card.type = "button";
    const heading = document.createElement("span");
    heading.className = "summary-label";
    heading.append(createIcon(key), id === "Graphics" ? "GPU" : label, createIcon("next"));
    const text = document.createElement("strong");
    text.textContent = value || "—";
    card.append(heading, text);
    const state = sections?.[key]?.state;
    const caption = state === "error" ? (systemInfo[key] ? "前回の値" : "取得失敗") : detail;
    if (caption) {
      const captionElement = document.createElement("span");
      captionElement.className = "summary-caption";
      captionElement.textContent = caption;
      card.append(captionElement);
    }
    card.addEventListener("click", () => {
      selectTab(id);
      panel.focus({ preventScroll: true });
    });
    list.append(card);
  }
  return list;
}

function sectionTitle(text) {
  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = text;
  return title;
}

function aboutView() {
  const section = document.createElement("section");
  section.className = "category about-card";
  const logo = document.createElement("img");
  logo.src = "./assets/nexaspec-insight.png";
  logo.alt = "";
  logo.width = 60;
  logo.height = 60;
  const title = document.createElement("h2");
  title.textContent = appInfo?.name || "NexaSpec Insight";
  const version = document.createElement("p");
  version.className = "muted";
  version.textContent = appInfo ? `バージョン ${appInfo.version} · Windows 10 / 11` : "Windows 10 / 11";
  section.append(logo, title, version, createMessage("PC の構成情報をローカルで取得します。コピーや保存では既定でシリアル番号を除外します。"));
  return section;
}

function renderTab() {
  const view = document.createDocumentFragment();
  const config = tabs.find((tab) => tab.id === activeTab);
  document.querySelector("#page-title").textContent = config?.title || config?.label ||
    (activeTab === "All" ? "システム概要" : "このアプリについて");
  if (activeTab === "All") {
    const summary = summaryCards(["CPU", "Graphics", "Memory", "Storage", "OS"]);
    summary.setAttribute("role", "group");
    summary.setAttribute("aria-label", "スペック概要");
    const sections = document.createElement("div");
    sections.className = "overview-grid";
    sections.append(...tabs.map((tab) => renderSection(tab, true)));
    view.append(summary, sectionTitle("PC 構成の詳細"), sections);
  } else if (config) {
    view.append(renderSection(config));
    if (config.key === "cpu") {
      const related = document.createElement("section");
      related.className = "category related";
      related.append(sectionTitle("関連する構成情報"), summaryCards(["Memory", "Storage", "OS"]));
      view.append(related);
    }
  } else {
    view.append(aboutView());
  }
  panel.replaceChildren(view);
  panel.setAttribute("aria-labelledby", `tab-${activeTab}`);
}

async function refresh(sections) {
  if (pendingSections || exporting) return;
  pendingSections = sections || tabs.map(({ key }) => key);
  announce("PCの情報を取得しています…");
  setControls();
  updateStatus();
  renderTab();
  try {
    systemInfo = await window.pcInfo.getSystemInfo(sections);
    collectionFailed = false;
    const failed = Object.values(systemInfo.sections).filter((item) => item.state === "error").length;
    announce(failed ? `${failed} 項目を取得できませんでした。各項目から再試行できます。` : "PCの情報を更新しました。", failed > 0);
  } catch (error) {
    collectionFailed = true;
    announce(errorMessage(error, "情報の取得に失敗しました。もう一度更新してください。"), true);
  } finally {
    pendingSections = null;
    updateStatus();
    renderTab();
    setControls();
  }
}

async function exportSpecs(save) {
  if (pendingSections || exporting) return;
  exporting = true;
  setControls();
  const includeSerial = document.querySelector("#include-serial").checked;
  try {
    if (save) {
      const result = await window.pcInfo.saveSpecs({ format: document.querySelector("#export-format").value, includeSerial });
      announce(result.canceled ? "保存をキャンセルしました。" : `${result.fileName} を保存しました。`);
    } else {
      await window.pcInfo.copySpecs({ includeSerial });
      announce(includeSerial ? "シリアル番号を含む一覧をコピーしました。" : "シリアル番号を除いた一覧をコピーしました。");
    }
  } catch (error) {
    announce(errorMessage(error, "出力に失敗しました。"), true);
  } finally {
    exporting = false;
    setControls();
  }
}

function selectTab(id) {
  activeTab = id;
  tabButtons.forEach((tab) => {
    const selected = tab.dataset.tab === id;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  renderTab();
  content.scrollTop = 0;
}

tabButtons.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab.dataset.tab));
  tab.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % tabButtons.length;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index - 1 + tabButtons.length) % tabButtons.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabButtons.length - 1;
    if (next !== undefined) { event.preventDefault(); tabButtons[next].click(); tabButtons[next].focus(); }
  });
});
document.querySelector("#refresh").addEventListener("click", () => refresh());
document.querySelector("#retry-failed").addEventListener("click", () => {
  const failed = Object.entries(systemInfo.sections).filter(([, item]) => item.state === "error");
  return refresh(failed.map(([key]) => key));
});
document.querySelector("#copy").addEventListener("click", () => exportSpecs(false));
document.querySelector("#save").addEventListener("click", () => exportSpecs(true));
window.pcInfo.getAppInfo().then((info) => {
  appInfo = info;
  document.querySelector("#app-version").textContent = `v${info.version}`;
  if (activeTab === "About") renderTab();
}).catch(() => {});
refresh();
