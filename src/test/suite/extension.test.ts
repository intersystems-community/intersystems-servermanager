/**
 * Integration tests against the IRIS containers defined in test-fixtures/iris/docker-compose.yml, opened through
 * the multi-root workspace test-fixtures/ci.code-workspace. Each intersystems.servers entry, and each workspace
 * folder connecting through one, is a configuration; the same checks run against every configuration they
 * apply to. Every check asserts that no credential prompt appeared: a prompt would block and the test would
 * time out.
 */
import { Authorization, IServerSpec, ServerManagerAPI } from "@intersystems-community/intersystems-servermanager";
import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import { extensionId, OBJECTSCRIPT_EXTENSIONID } from "../../commonActivate";
import { makeRESTRequest } from "../../makeRESTRequest";

/** Must match test-fixtures/iris/docker-compose.yml and the entries in test-fixtures/ci.code-workspace */
const SERVERS: Record<string, { port: number, username: string, password?: string }> = {
	ci: { port: 52799, username: "_SYSTEM", password: "SYS" },
	anon: { port: 52798, username: "" },
};
/** Workspace folders that the ObjectScript extension connects through an intersystems.servers entry */
const FOLDERS: Record<string, keyof typeof SERVERS> = {
	"client-named-server": "ci",
	"server-side": "ci",
	"server-side-anon": "anon",
};
/** The /api/atelier session timeout configured by test-fixtures/iris/setup/setup.sh */
const SESSION_TIMEOUT_MS = 10000;

let smApi: ServerManagerAPI;
let osApi: any;
/** Server documents created by the tests, for cleanup */
const created: Array<[string, string]> = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(label: string, probe: () => Promise<T | undefined | false>, timeoutMs = 30000): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const result = await probe();
		if (result) { return result; }
		await sleep(1000);
	}
	throw new Error(`Timed out after ${timeoutMs} ms waiting for ${label}`);
}

function folderUri(name: string): vscode.Uri {
	const folder = vscode.workspace.workspaceFolders?.find((f) => f.name === name);
	assert.ok(folder, `workspace folder '${name}' is missing`);
	return folder.uri;
}

/** Talks to a container directly, bypassing both extensions, to check what actually landed on the server */
async function restDoc(server: string, method: "GET" | "DELETE", name: string): Promise<string | undefined> {
	const { port, username, password } = SERVERS[server];
	const response = await fetch(`http://localhost:${port}/api/atelier/v1/USER/doc/${name}`, {
		headers: password ? { Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64") } : {},
		method,
	});
	if (response.status === 404) { return undefined; }
	assert.ok(response.ok, `${method} ${name} on ${server} failed with HTTP ${response.status}`);
	const { result } = await response.json();
	return Array.isArray(result.content) ? result.content.join("\n") : undefined;
}

async function specFor(name: string): Promise<IServerSpec & { auth: Authorization }> {
	const spec = await smApi.getServerSpec(name);
	assert.ok(spec?.auth, `no spec for ${name}`);
	return spec as IServerSpec & { auth: Authorization };
}

/** Write a class through the folder, confirm it reached the server, delete it, confirm it's gone */
async function assertRoundTrip(folder: string): Promise<void> {
	const server = FOLDERS[folder];
	const root = folderUri(folder);
	const className = `CiTest.${folder.replace(/-/g, "")}`;
	const file = root.scheme === "isfs"
		? vscode.Uri.joinPath(root, `${className.replace(/\./g, "/")}.cls`)
		// Written straight into the pre-existing src/ folder: creating a directory tree and a file in it at
		// once can lose the file's watcher event on Linux, which is not what this is testing
		: vscode.Uri.joinPath(root, "src", `${className}.cls`);
	created.push([server, `${className}.cls`]);
	const source = `Class ${className}\n{\n\nClassMethod Hello() As %String\n{\n\tQuit "hello"\n}\n\n}\n`;
	await vscode.workspace.fs.writeFile(file, Buffer.from(source));
	const onServer = await waitFor(`${className} to appear on ${server}`, () => restDoc(server, "GET", `${className}.cls`));
	assert.match(onServer, new RegExp(`^Class ${className}`));
	await vscode.workspace.fs.delete(file);
	await waitFor(`${className} to be deleted from ${server}`, async () => !(await restDoc(server, "GET", `${className}.cls`)));
}

suite("Servers in IRIS containers", () => {
	suiteSetup(async () => {
		const serverManager = vscode.extensions.getExtension(extensionId)!;
		// The ObjectScript extension depends on the Marketplace release of this extension, which gets
		// installed alongside; the build under test must be the one that ends up running
		assert.strictEqual(serverManager.extensionPath, path.resolve(__dirname, "../../.."));
		smApi = await serverManager.activate();
		const objectscript = vscode.extensions.getExtension(OBJECTSCRIPT_EXTENSIONID);
		assert.ok(objectscript, `${OBJECTSCRIPT_EXTENSIONID} is not installed`);
		// Hangs here (and fails on the mocha timeout) if its activation blocks on a credential prompt
		osApi = await objectscript.activate();
	});

	suiteTeardown(async () => {
		for (const [server, name] of created) { await restDoc(server, "DELETE", name).catch(() => undefined); }
		const src = vscode.Uri.joinPath(folderUri("client-named-server"), "src");
		for (const [name] of await vscode.workspace.fs.readDirectory(src)) {
			if (name.endsWith(".cls")) { await vscode.workspace.fs.delete(vscode.Uri.joinPath(src, name)); }
		}
	});

	for (const [name, expected] of Object.entries(SERVERS)) {
		test(`${name}: getServerSpec resolves the entry without prompting`, async () => {
			const spec = await specFor(name);
			assert.strictEqual(spec.webServer.scheme, "http");
			assert.strictEqual(spec.webServer.host, "localhost");
			assert.strictEqual(spec.webServer.port, expected.port);
			assert.strictEqual(spec.webServer.pathPrefix, "");
			assert.strictEqual(spec.username, expected.username);
			// A password stored in plaintext in settings must reach API consumers such as the ObjectScript extension
			assert.strictEqual(spec.password, expected.password);
			assert.strictEqual(spec.auth.resolved(), expected.password !== undefined);
		});

		test(`${name}: lists namespaces without prompting, as the Servers view does`, async () => {
			const response = await makeRESTRequest("GET", await specFor(name));
			assert.strictEqual(response.status, 200);
			assert.ok(response.data.result.content.namespaces.includes("USER"), "USER namespace not listed");
		});

		test(`${name}: still lists namespaces after the session expired`, async () => {
			// Idle past the server's session timeout so the cached cookie is rejected
			await sleep(SESSION_TIMEOUT_MS + 3000);
			const response = await makeRESTRequest("GET", await specFor(name));
			assert.strictEqual(response.status, 200);
		});
	}

	for (const [folder, server] of Object.entries(FOLDERS)) {
		test(`${folder}: the ObjectScript extension resolves the '${server}' entry without prompting`, async () => {
			const conn = await osApi.asyncServerForUri(folderUri(folder));
			assert.strictEqual(conn.active, true);
			assert.strictEqual(conn.host, "localhost");
			assert.strictEqual(conn.port, SERVERS[server].port);
			assert.strictEqual(conn.namespace, "USER");
			assert.strictEqual(conn.username, SERVERS[server].username);
			assert.strictEqual(conn.password, SERVERS[server].password);
		});

		test(`${folder}: saving a class syncs it to the server and deleting it removes it`, () => assertRoundTrip(folder));
	}

	for (const folder of ["server-side", "server-side-anon"]) {
		test(`${folder}: lists the namespace`, async () => {
			const entries = await vscode.workspace.fs.readDirectory(folderUri(folder));
			assert.ok(entries.length > 0, "namespace listing is empty");
		});
	}
});
