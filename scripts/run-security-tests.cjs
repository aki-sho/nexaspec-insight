const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const electronPath = require("electron");
const testPrefix = "nexaspec-insight-security-";
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), testPrefix));
const env = { ...process.env, PC_SPEC_SECURITY_TEST_DIR: testDirectory };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [path.join(__dirname, "../tests/electron-security.cjs")], {
  env,
  stdio: "inherit",
  windowsHide: true,
  timeout: 120000
});

function cleanUp() {
  const resolved = path.resolve(testDirectory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
      !path.basename(resolved).startsWith(testPrefix)) {
    throw new Error("Refusing to remove an unexpected test directory");
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("close", (code, signal) => {
  let exitCode = code === 0 ? 0 : 1;
  try {
    if (exitCode) console.error(`Electron integration tests exited with ${signal || code}`);
    if (exitCode === 0 && process.env.PC_SPEC_SECURITY_APP_ROOT) {
      require("./verify-package.cjs").verifyPackage(process.env.PC_SPEC_SECURITY_APP_ROOT);
    }
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    cleanUp();
    process.exitCode = exitCode;
  }
});
