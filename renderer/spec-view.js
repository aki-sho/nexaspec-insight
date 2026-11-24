// Hardware values and error messages must only enter the DOM as text.
export function createMessage(message) {
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  paragraph.className = "empty-message";
  return paragraph;
}

export function createMessageView(title, message) {
  const fragment = document.createDocumentFragment();
  const heading = document.createElement("h2");
  heading.textContent = title;
  const paragraph = createMessage(message);
  fragment.append(heading, paragraph);
  return fragment;
}

export function createSpecGrid(rows) {
  const grid = document.createElement("dl");
  grid.className = "spec-grid";

  for (const [label, value] of rows) {
    const labelElement = document.createElement("dt");
    const valueElement = document.createElement("dd");
    labelElement.className = "label";
    valueElement.className = "value";
    labelElement.textContent = label;
    valueElement.textContent = value ?? "—";
    grid.append(labelElement, valueElement);
  }

  return grid;
}

export function formatBytes(value, binary = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const base = binary ? 1024 : 1000;
  const units = binary ? ["B", "KiB", "MiB", "GiB", "TiB"] : ["B", "KB", "MB", "GB", "TB"];
  const size = Math.max(0, Number(value));
  const index = size ? Math.max(0, Math.min(Math.floor(Math.log(size) / Math.log(base)), units.length - 1)) : 0;
  return `${(size / base ** index).toLocaleString("ja-JP", { maximumFractionDigits: 2 })} ${units[index]}`;
}

export function formatNumber(value, unit) {
  return Number.isFinite(value) ? `${value.toLocaleString("ja-JP", { maximumFractionDigits: 2 })} ${unit}` : "—";
}

export function formatDateTime(value, dateOnly = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateOnly ? date.toLocaleDateString("ja-JP") : date.toLocaleString("ja-JP");
}

export function createCard(title, rows) {
  const card = document.createElement("article");
  card.className = "spec-card";
  const heading = document.createElement("strong");
  heading.className = "device-name";
  heading.textContent = title;
  card.append(heading, createSpecGrid(rows));
  return card;
}

export function createCardGroup(label, cards) {
  const group = document.createElement("div");
  group.className = "device-group";
  const heading = document.createElement("p");
  heading.className = "device-group-label";
  heading.textContent = label;
  group.append(heading);
  const list = document.createElement("div");
  list.className = "card-list";
  list.append(...cards);
  group.append(list);
  return group;
}
