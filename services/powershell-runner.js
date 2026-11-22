const { execFile } = require("node:child_process");
const path = require("node:path");
const { promisify } = require("node:util");

const runFile = promisify(execFile);

const queries = {
  graphics: `
    $adapters = @(Get-CimInstance -ClassName Win32_VideoController -Property Name, DriverVersion, DriverDate |
      Select-Object Name, DriverVersion, @{Name='DriverDate';Expression={
        if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) }
      }})
    @{adapters=$adapters} | ConvertTo-Json -Compress -Depth 3
  `,
  storage: `
    $volumes = @(Get-CimInstance -ClassName Win32_LogicalDisk -Property DeviceID, VolumeName, DriveType |
      Select-Object DeviceID, VolumeName, DriveType)
    @{volumes=$volumes} | ConvertTo-Json -Compress -Depth 3
  `,
  firmware: `
    $type = (Get-ComputerInfo -Property BiosFirmwareType -ErrorAction SilentlyContinue).BiosFirmwareType
    @{type=[string]$type} | ConvertTo-Json -Compress
  `,
  os: String.raw`
    $version = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -Name DisplayVersion -ErrorAction SilentlyContinue
    $os = Get-CimInstance -ClassName Win32_OperatingSystem -Property InstallDate, LastBootUpTime -ErrorAction SilentlyContinue
    $details = @{displayVersion=$version.DisplayVersion; installDate=$null; lastBootAt=$null}
    if ($os.InstallDate) { $details.installDate = $os.InstallDate.ToUniversalTime().ToString('o') }
    if ($os.LastBootUpTime) { $details.lastBootAt = $os.LastBootUpTime.ToUniversalTime().ToString('o') }
    $details | ConvertTo-Json -Compress
  `
};

async function readWindowsDetails(section) {
  if (process.platform !== "win32" || !Object.hasOwn(queries, section)) return {};
  if (section === "firmware" && /^(uefi|bios|legacy)$/i.test(process.env.firmware_type || "")) {
    return { type: process.env.firmware_type };
  }

  const executable = path.join(
    process.env.SystemRoot || "C:\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
  );
  const script = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n" + queries[section];
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const { stdout } = await runFile(executable, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded
  ], { windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024, encoding: "utf8" });
  return JSON.parse(stdout.trim());
}

module.exports = { readWindowsDetails };
