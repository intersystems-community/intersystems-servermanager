import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from "@vscode/test-electron";

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, "../../");

		// The path to the extension test script
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, "./suite/index");

		// The multi-root workspace whose folders connect to the IRIS containers started from test-fixtures/iris
		const workspace = path.resolve(extensionDevelopmentPath, "test-fixtures", "ci.code-workspace");

		const vscodeExecutablePath = await downloadAndUnzipVSCode("stable");
		const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

		// The released ObjectScript extension connects the fixture workspace's folders through our API
		cp.spawnSync(cli, [...args, "--install-extension", "intersystems-community.vscode-objectscript"], {
			encoding: "utf-8",
			stdio: "inherit",
		});

		// A fresh user-data-dir so sessions and secrets stored by a previous run can't mask bugs
		const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "servermanager-test-"));
		const launchArgs = [workspace, "--user-data-dir", userDataDir, "--disable-workspace-trust"];

		// Inherited from a VS Code extension host (e.g. a terminal spawned by an extension); would make
		// the downloaded VS Code run as plain Node and try to execute the workspace file as a script
		delete process.env.ELECTRON_RUN_AS_NODE;
		try {
			await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs });
		} catch (err) {
			// The two extensions' log channels are the best record of what they sent to the servers
			for (const log of fs.readdirSync(userDataDir, { recursive: true }) as string[]) {
				if (/intersystems-community\.[^/\\]+[/\\][^/\\]+\.log$/.test(log)) {
					console.error(`\n===== ${log} =====\n${fs.readFileSync(path.join(userDataDir, log), "utf-8")}`);
				}
			}
			throw err;
		}
	} catch (err) {
		console.error("Failed to run tests", err);
		process.exit(1);
	}
}

main();
