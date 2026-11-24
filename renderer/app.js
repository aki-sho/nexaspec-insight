import { cpuTemplate } from "../templates/cpu-template.js";
import { gpuTemplate } from "../templates/gpu-template.js";
import { memoryTemplate } from "../templates/memory-template.js";
import { motherboardTemplate } from "../templates/motherboard-template.js";
import { osTemplate } from "../templates/os-template.js";
import { storageTemplate } from "../templates/storage-template.js";
import { createMessage, createMessageView, formatBytes, formatDateTime } from "./spec-view.js";

const tabs = [
  ["CPU", "cpu", cpuTemplate], ["Mainboard", "mainboard", motherboardTemplate],
  ["Memory", "memory", memoryTemplate], ["Graphics", "graphics", gpuTemplate],
  ["Storage", "storage", storageTemplate], ["OS", "os", osTemplate]
];
let systemInfo = null;
let activeTab = "All";
let pendingSections = null;
let exporting = false;
let version = "";
const panel = document.querySelector(".panel");
const notice = document.querySelector("#notice");

function announce(message, error = false) {
  notice.textContent = message;
  notice.classList.toggle("is-error", error);
}

function errorMessage(error, fallback) {
  return String(error?.message || fallback).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

function setControls() {
  const busy = Boolean(pendingSections) || exporting;
  document.querySelector("#refresh").disabled = busy;
  document.querySelector("#refresh").textContent = pendingSections ? "取得中…" : "すべて更新";
  for (const element of document.querySelectorAll(".export-control")) {
    element.disabled = busy || !tabs.some(([, key]) => systemInfo?.[key]);
  }
  document.querySelector("#retry-failed").hidden = !Object.values(systemInfo?.sections || {}).some((item) => item.state === "error");
  document.querySelector("#retry-failed").disabled = busy;
  for (const button of panel.querySelectorAll(".retry-section")) button.disabled = busy;
}

function updateSummary() {
  const summaries = {
    cpu: systemInfo?.cpu?.brand || "—",
    memory: systemInfo?.memory?.total ? formatBytes(systemInfo.memory.total, true) : "—",
    graphics: systemInfo?.graphics?.controllers?.length ? `${systemInfo.graphics.controllers.length} 台` : "—",
    storage: systemInfo?.storage?.disks?.length ? `${systemInfo.storage.disks.length} 台` : "—"
  };
  for (const [key, value] of Object.entries(summaries)) {
    const element = document.querySelector(`#summary-${key}`);
    element.textContent = value;
    element.title = value;
  }
  const failed = Object.values(systemInfo?.sections || {}).filter((item) => item.state === "error").length;
  const stamp = document.querySelector("#last-updated");
  stamp.hidden = !systemInfo?.capturedAt;
  stamp.textContent = `最終確認 ${formatDateTime(systemInfo?.capturedAt)}`;
  let status = systemInfo ? "取得済み" : "未取得";
  if (failed) status = `${failed} 分類で取得失敗`;
  if (pendingSections) status = "取得中";
  document.querySelector("#system-state").textContent = status;
  document.querySelector(".system-status").classList.toggle("warning", failed > 0);
}

function renderSection([name, key, template], overview = false) {
  const section = document.createElement("section");
  section.className = "category";
  section.dataset.section = key;
  if (overview && key !== "cpu" && key !== "mainboard") section.classList.add("category-wide");

  const header = document.createElement("header");
  header.className = "category-header";
  const title = document.createElement(overview ? "h3" : "h2");
  title.textContent = name;
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
    retry.setAttribute("aria-label", `${name}を再取得`);
    retry.disabled = Boolean(pendingSections) || exporting;
    retry.addEventListener("click", () => refresh([key]));
    banner.append(message, retry);
    section.append(banner);
  }
  if (hasData) {
    section.append(template(systemInfo));
  } else if (!failed || refreshing) {
    section.append(createMessage(refreshing ? "読み込み中です…" : "情報はまだ取得されていません。"));
  }
  return section;
}

function renderTab() {
  let view;
  if (activeTab === "All") {
    view = document.createDocumentFragment();
    const heading = document.createElement("h2");
    heading.className = "overview-title";
    heading.textContent = "すべて";
    const sections = document.createElement("div");
    sections.className = "overview-grid";
    sections.append(...tabs.map((tab) => renderSection(tab, true)));
    view.append(heading, sections);
  } else {
    const config = tabs.find(([name]) => name === activeTab);
    view = config
      ? renderSection(config)
      : createMessageView("About", `PC Spec Tool ${version} · Windowsの構成情報をローカルで確認できます。`);
  }
  panel.replaceChildren(view);
  panel.setAttribute("aria-labelledby", `tab-${activeTab}`);
}

async function refresh(sections) {
  if (pendingSections || exporting) return;
  pendingSections = sections || tabs.map(([, key]) => key);
  announce("PCの情報を取得しています…");
  setControls();
  updateSummary();
  renderTab();
  try {
    systemInfo = await window.pcInfo.getSystemInfo(sections);
    const failed = Object.values(systemInfo.sections).filter((item) => item.state === "error").length;
    announce(failed ? `${failed} 項目を取得できませんでした。各項目から再試行できます。` : "PCの情報を更新しました。", failed > 0);
  } catch (error) {
    announce(errorMessage(error, "情報の取得に失敗しました。もう一度更新してください。"), true);
  } finally {
    pendingSections = null;
    updateSummary();
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

const tabButtons = [...document.querySelectorAll(".tab")];
const content = document.querySelector(".content");
tabButtons.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab;
    tabButtons.forEach((item) => {
      const selected = item === tab;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    renderTab();
    content.scrollTop = 0;
  });
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
document.querySelector("#retry-failed").addEventListener("click", () => refresh(Object.entries(systemInfo.sections).filter(([, value]) => value.state === "error").map(([key]) => key)));
document.querySelector("#copy").addEventListener("click", () => exportSpecs(false));
document.querySelector("#save").addEventListener("click", () => exportSpecs(true));
window.pcInfo.getAppInfo().then((info) => { version = info.version; document.querySelector("#app-version").textContent = `v${version}`; }).catch(() => {});
refresh();
