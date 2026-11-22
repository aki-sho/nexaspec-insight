const assert = require("node:assert/strict");
const test = require("node:test");
const { createHardwareService, validateSections, SECTION_KEYS } = require("../services/hardware-service");

const noWindowsDetails = { readWindowsDetails: async () => ({}) };

function fixture() {
  const calls = {};
  const values = {
    cpu: { brand: "Test CPU", cores: 8 }, baseboard: { model: "Test board", serial: "board-private" },
    mem: { total: 32 * 1024 ** 3 },
    memLayout: [{ bank: "DIMM A1", size: 16 * 1024 ** 3, type: "DDR5", clockSpeed: 5600, serialNum: "mem-private" }, { bank: "DIMM B1", size: 16 * 1024 ** 3 }],
    graphics: { controllers: [{ model: "GPU 1", vram: 8192, secret: "unused" }, { model: "GPU 2", vram: 0 }] },
    diskLayout: [{ name: "Test HDD", type: "HD", size: 1000, serialNum: "disk-private" }],
    fsSize: [{ mount: "C:", size: 1000, used: 200, available: 800, use: 20 }],
    osInfo: { distro: "Windows", arch: "x64" }
  };
  const si = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, async () => {
    calls[key] = (calls[key] || 0) + 1;
    return value;
  }]));
  return { si, calls };
}

test("collects physical disks, free volume space, memory modules and every GPU", async () => {
  const { si } = fixture();
  const result = await createHardwareService(si, noWindowsDetails).collect();
  assert.deepEqual(Object.keys(result.sections).sort(), [...SECTION_KEYS].sort());
  assert.equal(result.memory.totalGB, "32.00");
  assert.equal(result.memory.modules.length, 2);
  assert.equal(result.graphics.controllers.length, 2);
  assert.equal(result.graphics.controllers[1].vram, 0);
  assert.equal(result.graphics.controllers[0].secret, undefined);
  assert.equal(result.storage.disks[0].type, "HDD");
  assert.equal(result.storage.volumes[0].available, 800);
  assert.ok(Object.values(result.sections).every((section) => section.state === "ok"));
});

test("one failed section leaves the other five usable and retry only fetches the failed section", async () => {
  const { si, calls } = fixture();
  const cpu = si.cpu;
  si.cpu = async () => { throw new Error("failure"); };
  const service = createHardwareService(si, noWindowsDetails);
  const failed = await service.collect();
  assert.equal(failed.sections.cpu.state, "error");
  assert.equal(failed.cpu, undefined);
  assert.equal(failed.storage.volumes[0].available, 800);
  assert.equal(Object.values(failed.sections).filter((item) => item.state === "ok").length, 5);
  si.cpu = cpu;
  const recovered = await service.collect(["cpu"]);
  assert.equal(recovered.sections.cpu.state, "ok");
  assert.equal(calls.cpu, 1);
  assert.equal(calls.diskLayout, 1);
  assert.equal(calls.memLayout, 1);
});

test("refresh failure preserves old data and marks it stale; returned snapshots cannot alter the cache", async () => {
  const { si } = fixture();
  const service = createHardwareService(si, noWindowsDetails);
  const initial = await service.collect(["cpu"]);
  initial.cpu.brand = "tampered";
  assert.equal(service.snapshot().cpu.brand, "Test CPU");
  si.cpu = async () => { throw new Error("failure"); };
  const stale = await service.collect(["cpu"]);
  assert.equal(stale.cpu.brand, "Test CPU");
  assert.equal(stale.sections.cpu.state, "error");
  assert.equal(stale.sections.cpu.updatedAt, initial.sections.cpu.updatedAt);
});

test("hanging collectors time out without blocking successful sections", async () => {
  const { si } = fixture();
  si.cpu = () => new Promise(() => {});
  const result = await createHardwareService(si, { ...noWindowsDetails, timeoutMs: 15 }).collect(["cpu", "os"]);
  assert.equal(result.sections.cpu.state, "error");
  assert.equal(result.sections.os.state, "ok");
});

test("overlapping requests share an in-flight hardware query", async () => {
  const { si, calls } = fixture();
  const service = createHardwareService(si, noWindowsDetails);
  await Promise.all([service.collect(["cpu"]), service.collect(["cpu", "memory"])]);
  assert.equal(calls.cpu, 1);
  assert.equal(calls.mem, 1);
});

test("section selection rejects unsupported names, duplicate keys and malformed IPC inputs", () => {
  for (const input of [null, "cpu", [], ["__proto__"], ["cpu", "cpu"], ["cpu", "exec"], {}]) {
    assert.throws(() => validateSections(input));
  }
});

test("enriches the existing sections without misassigning Windows driver and volume details", async () => {
  const { si } = fixture();
  si.cpu = async () => ({ socket: "AM5", speedMax: 5.6, cache: { l2: 4096, l3: 0 } });
  si.bios = async () => ({ vendor: "AMI", version: "1.20", releaseDate: "2025-04-01", serial: "bios-private" });
  si.baseboard = async () => ({ memSlots: 4, memMax: 128 * 1024 ** 3 });
  si.mem = async () => ({ total: 32 * 1024 ** 3, active: 0, used: 7, available: 32 * 1024 ** 3 });
  si.memLayout = async () => [{ formFactor: "SODIMM", voltageConfigured: 1.2 }];
  si.graphics = async () => ({
    controllers: [
      { model: "Test GPU", driverVersion: "31.1", temperatureGpu: 0, powerDraw: 32 },
      { model: "Different GPU" },
      { model: "Ambiguous GPU" }
    ],
    displays: [{ model: "Test panel", currentResX: 1920, currentResY: 1080, currentRefreshRate: 0, connection: "HDMI", serial: "display-private" }]
  });
  si.diskLayout = async () => [{
    name: "SSD", firmwareRevision: "123", bytesPerSector: 4096,
    smartData: { smart_status: { passed: false }, power_on_time: { hours: 0 }, nvme_smart_health_information_log: { percentage_used: 1 }, serial_number: "smart-private" }
  }];
  si.fsSize = async () => [{ mount: "c:\\" }, { mount: "C:\\A mounted folder", fs: "C:" }];
  si.osInfo = async () => ({ uefi: true });
  si.time = () => ({ uptime: 3600 });
  const windowsDetails = {
    graphics: { adapters: [
      { Name: "Different GPU", DriverVersion: "32", DriverDate: "2025-03-01" },
      { Name: "Test GPU", DriverVersion: "30.1", DriverDate: "2024-02-03" },
      { Name: " test GPU ", DriverVersion: "31.1", DriverDate: "2025-02-03" },
      { Name: "Ambiguous GPU", DriverDate: "2025-02-01" },
      { Name: "Ambiguous GPU", DriverDate: "2025-02-02" }
    ] },
    storage: { volumes: [{ DeviceID: "C:", VolumeName: "システム", DriveType: 3 }] },
    os: { displayVersion: "25H2", installDate: "2025-03-02T07:55:00+09:00", lastBootAt: "2025-04-01T00:00:00Z" },
    firmware: { type: "Bios" }
  };
  const result = await createHardwareService(si, { readWindowsDetails: async (key) => windowsDetails[key] }).collect();
  assert.deepEqual(result.cpu.cache, { l2: 4096, l3: null });
  assert.equal(result.cpu.socket, "AM5");
  assert.equal(result.mainboard.bios.version, "1.20");
  assert.equal(result.mainboard.memSlots, 4);
  assert.equal(result.memory.used, 0);
  assert.equal(result.memory.modules[0].voltageConfigured, 1.2);
  assert.deepEqual(result.graphics.controllers.map((gpu) => gpu.driverDate), ["2025-02-03", "2025-03-01", null]);
  assert.equal(result.graphics.controllers[0].temperatureGpu, 0);
  assert.equal(result.graphics.displays[0].currentRefreshRate, null);
  assert.equal(result.storage.disks[0].powerOnHours, 0);
  assert.equal(result.storage.disks[0].smartPassed, false);
  assert.equal(result.storage.volumes[0].driveType, 3);
  assert.equal(result.storage.volumes[0].label, "システム");
  assert.equal(result.storage.volumes[1].label, null);
  assert.equal(result.os.displayVersion, "25H2");
  assert.equal(result.os.installDate, "2025-03-01T22:55:00.000Z");
  assert.equal(result.os.lastBootAt, "2025-04-01T00:00:00.000Z");
  assert.equal(result.os.uefi, false);
  assert.doesNotMatch(JSON.stringify(result), /bios-private|display-private|smart-private/);
});

test("unavailable and slow supplementary queries leave the original section data usable", async () => {
  const { si } = fixture();
  si.bios = () => new Promise(() => {});
  si.osInfo = async () => ({ uefi: false });
  const result = await createHardwareService(si, {
    timeoutMs: 40,
    readWindowsDetails: async () => { throw new Error("provider unavailable"); }
  }).collect();
  assert.ok(Object.values(result.sections).every((section) => section.state === "ok"));
  assert.equal(result.mainboard.model, "Test board");
  assert.equal(result.mainboard.bios.version, null);
  assert.equal(result.graphics.controllers[0].driverDate, null);
  assert.equal(result.storage.volumes[0].available, 800);
  assert.equal(result.os.installDate, null);
  assert.equal(result.os.uefi, null);
});
