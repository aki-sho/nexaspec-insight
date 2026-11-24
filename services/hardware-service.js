const { readWindowsDetails: readLocalWindowsDetails } = require("./powershell-runner");

const SECTION_KEYS = Object.freeze(["cpu", "mainboard", "memory", "graphics", "storage", "os"]);

function number(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function positiveNumber(value) {
  const result = number(value);
  return result > 0 ? result : null;
}

function knownText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && !/^(unknown|n\/a|not available)$/i.test(text) ? text : null;
}

function dateTime(value) {
  const stamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
}

async function withTimeout(read, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function driverDate(controller, adapters) {
  const model = knownText(controller.model)?.toLowerCase();
  if (!model) return null;
  const matchingModels = adapters.filter((adapter) => knownText(adapter.Name)?.toLowerCase() === model);
  const matchingVersions = matchingModels.filter((adapter) => adapter.DriverVersion === controller.driverVersion);
  const candidates = matchingVersions.length ? matchingVersions : matchingModels;
  const dates = new Set(candidates.map((adapter) => knownText(adapter.DriverDate)));
  return dates.size === 1 ? dates.values().next().value : null;
}

function driveLetter(value) {
  return /^(?<drive>[a-z]:)[\\/]*$/i.exec(knownText(value) || "")?.groups.drive.toUpperCase();
}

function validateSections(sections = SECTION_KEYS) {
  if (!Array.isArray(sections) || !sections.length || sections.length > SECTION_KEYS.length ||
      sections.some((key) => !SECTION_KEYS.includes(key)) || new Set(sections).size !== sections.length) {
    throw new Error("再取得する項目が正しくありません。");
  }
  return [...sections];
}

function createHardwareService(si, { timeoutMs = 20000, readWindowsDetails = readLocalWindowsDetails } = {}) {
  const state = { sections: {}, capturedAt: null };
  const pending = new Map();

  async function readOptional(read) {
    try {
      return (await withTimeout(read, Math.min(6000, timeoutMs / 2))) || {};
    } catch {
      return {};
    }
  }

  const collectors = {
    cpu: async () => {
      const data = await si.cpu();
      return {
        manufacturer: data.manufacturer,
        brand: data.brand,
        cores: data.cores,
        physicalCores: data.physicalCores,
        speed: positiveNumber(data.speed),
        socket: knownText(data.socket),
        speedMax: positiveNumber(data.speedMax),
        cache: {
          l2: positiveNumber(data.cache?.l2),
          l3: positiveNumber(data.cache?.l3)
        }
      };
    },
    mainboard: async () => {
      const [data, bios] = await Promise.all([si.baseboard(), readOptional(() => si.bios())]);
      return {
        manufacturer: data.manufacturer,
        model: data.model,
        version: data.version,
        serial: data.serial,
        memSlots: positiveNumber(data.memSlots),
        memMax: positiveNumber(data.memMax),
        bios: {
          vendor: knownText(bios.vendor),
          version: knownText(bios.version),
          releaseDate: knownText(bios.releaseDate)
        }
      };
    },
    memory: async () => {
      const [data, modules] = await Promise.all([si.mem(), si.memLayout()]);
      return {
        totalGB: ((number(data.total) || 0) / 1024 ** 3).toFixed(2),
        total: number(data.total),
        used: number(data.active ?? data.used),
        available: number(data.available),
        modules: modules.map((item) => ({
          bank: item.bank,
          size: number(item.size),
          type: item.type,
          clockSpeed: number(item.clockSpeed),
          manufacturer: item.manufacturer,
          partNum: item.partNum,
          serial: item.serialNum,
          formFactor: knownText(item.formFactor),
          voltageConfigured: positiveNumber(item.voltageConfigured)
        }))
      };
    },
    graphics: async () => {
      const [data, details] = await Promise.all([
        si.graphics(),
        readOptional(() => readWindowsDetails("graphics"))
      ]);
      const adapters = details.adapters || [];
      return {
        controllers: (data.controllers || []).map((item) => ({
          model: item.model,
          vendor: item.vendor,
          vram: number(item.vram),
          bus: item.bus,
          driverVersion: item.driverVersion,
          driverDate: driverDate(item, adapters),
          temperatureGpu: number(item.temperatureGpu),
          powerDraw: number(item.powerDraw)
        })),
        displays: (data.displays || []).map((item) => ({
          model: knownText(item.model),
          vendor: knownText(item.vendor),
          main: typeof item.main === "boolean" ? item.main : null,
          currentResX: positiveNumber(item.currentResX),
          currentResY: positiveNumber(item.currentResY),
          currentRefreshRate: positiveNumber(item.currentRefreshRate),
          connection: knownText(item.connection)
        }))
      };
    },
    storage: async () => {
      const [disks, volumes, details] = await Promise.all([
        si.diskLayout(),
        si.fsSize(),
        readOptional(() => readWindowsDetails("storage"))
      ]);
      const byDrive = new Map((details.volumes || [])
        .map((volume) => [driveLetter(volume.DeviceID), volume])
        .filter(([drive]) => drive));
      return {
        disks: disks.map((item) => ({
          name: item.name,
          type: item.type === "HD" ? "HDD" : item.type,
          size: number(item.size),
          interfaceType: item.interfaceType,
          serial: item.serialNum,
          firmwareRevision: knownText(item.firmwareRevision),
          bytesPerSector: positiveNumber(item.bytesPerSector),
          healthStatus: knownText(item.smartStatus),
          smartPassed: typeof item.smartData?.smart_status?.passed === "boolean" ? item.smartData.smart_status.passed : null,
          temperature: number(item.temperature),
          powerOnHours: number(item.smartData?.power_on_time?.hours),
          nvmePercentageUsed: number(item.smartData?.nvme_smart_health_information_log?.percentage_used)
        })),
        volumes: volumes.map((item) => {
          const detail = byDrive.get(driveLetter(item.mount || item.fs));
          return {
            fs: item.fs,
            mount: item.mount,
            type: item.type,
            size: number(item.size),
            used: number(item.used),
            available: number(item.available),
            use: number(item.use),
            label: knownText(detail?.VolumeName),
            driveType: number(detail?.DriveType)
          };
        })
      };
    },
    os: async () => {
      const [data, details, time, firmware] = await Promise.all([
        si.osInfo(),
        readOptional(() => readWindowsDetails("os")),
        readOptional(() => si.time()),
        readOptional(() => readWindowsDetails("firmware"))
      ]);
      const firmwareType = knownText(firmware.type)?.toLowerCase();
      let uefi = data.uefi === true ? true : null;
      if (firmwareType === "uefi") uefi = true;
      if (firmwareType === "bios" || firmwareType === "legacy") uefi = false;
      return {
        distro: data.distro,
        release: data.release,
        build: data.build,
        arch: data.arch,
        displayVersion: knownText(details.displayVersion),
        installDate: dateTime(details.installDate),
        lastBootAt: dateTime(details.lastBootAt),
        uptime: number(time.uptime),
        uefi
      };
    }
  };

  async function collectSection(key) {
    try {
      const data = await withTimeout(collectors[key], timeoutMs);
      state[key] = data;
      state.sections[key] = { state: "ok", updatedAt: new Date().toISOString() };
    } catch {
      state.sections[key] = { state: "error", updatedAt: state.sections[key]?.updatedAt || null,
        error: "情報を取得できませんでした。再試行してください。" };
    } finally {
      pending.delete(key);
    }
  }

  return {
    async collect(sections) {
      const keys = validateSections(sections);
      await Promise.all(keys.map((key) => {
        if (!pending.has(key)) pending.set(key, collectSection(key));
        return pending.get(key);
      }));
      state.capturedAt = new Date().toISOString();
      return structuredClone(state);
    },
    snapshot() { return structuredClone(state); }
  };
}

module.exports = { SECTION_KEYS, validateSections, createHardwareService };
