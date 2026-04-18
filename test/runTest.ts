import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "..");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vnsutra-tests-"));
    const userDataDir = path.join(tempRoot, "user-data");
    const extensionsDir = path.join(tempRoot, "extensions");
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(extensionsDir, { recursive: true });

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        extensionDevelopmentPath,
        "--disable-updates",
        "--disable-workspace-trust",
        "--user-data-dir",
        userDataDir,
        "--extensions-dir",
        extensionsDir
      ]
    });
  } catch (error) {
    console.error("Failed to run VS Code extension tests.");
    console.error(error);
    process.exit(1);
  }
}

void main();
