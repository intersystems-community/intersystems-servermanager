import * as vscode from "vscode";
import { promptOAuth2Authority, promptOAuth2ClientId } from "../oauth2Prompts";
import { IServerSetting } from "../serverSetting";
import { getServerNames } from "./getServerNames";

export async function addServer(
	scope?: vscode.ConfigurationScope,
	target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global,
): Promise<string | undefined> {
	const serverNames = getServerNames(scope);
	const name = await vscode.window.showInputBox({
		ignoreFocusOut: true,
		title: "Enter name of new server definition",
		validateInput: (value) => {
			if (value === "") {
				return "Required";
			}
			if (serverNames.filter((server) => server.name === value).length) {
				return "Name already exists";
			}
			if (!value.match(/^[a-z0-9-_~]+$/)) {
				return "Can only contain a-z, 0-9 and punctuation -_~";
			}
			return null;
		},
	});
	if (name === undefined) { return; }
	let description = await vscode.window.showInputBox({
		ignoreFocusOut: true,
		title: "Optionally enter a description",
	});
	if (description === undefined) { return; }
	description = description.trim();
	let url = undefined as { scheme: string; host: string; port: string; pathPrefix: string } | undefined;
	let hostOrURL = await vscode.window.showInputBox({
		ignoreFocusOut: true,
		placeHolder: "http(s)://host:port/pathPrefix  or  host",
		title: "Enter the base URL used to connect to the server, or just its hostname/IP",
		validateInput: (value) => {
			value = value.trim()
			try {
				const localURL = new URL(value);
				const scheme = localURL.protocol.slice(0, -1);
				if (!["http", "https"].includes(scheme)) {
					return `Invalid scheme (${scheme}): must be either http or https`
				}
				const host = localURL.hostname;
				const port = localURL.port || (scheme === "https" ? "443" : "80");
				const portValidation = validatePort(port)
				if (portValidation) {
					return `Invalid port (${port}): ` + portValidation
				}
				url = { scheme, host, port, pathPrefix: localURL.pathname };
				return
			} catch {
				url = undefined;
				return validateHost(value);
			}
		},
	});
	function validateHost(value: string): "Required" | "Invalid host" | undefined {
		value = value.trim();
		if (!value.length) { return "Required"; }
		try {
			if (new URL(`http://${value}:80/`).hostname === value.toLowerCase()) {
				return
			}
		} catch { }
		return "Invalid host";
	}
	if (hostOrURL === undefined) { return; }
	const host = url?.host ?? hostOrURL.trim();
	const port = url?.port ?? await vscode.window.showInputBox({
		ignoreFocusOut: true,
		title: "Enter the port of the web server",
		validateInput: validatePort,
	});
	function validatePort(value: string): "Required, 1-65535" | undefined {
		const port = +value;
		return value.match(/\d+/) &&
			port.toString() === value &&
			port > 0 &&
			port < 65536
			? undefined
			: "Required, 1-65535";
	}
	if (port === undefined) { return; }
	let pathPrefix = url?.pathPrefix ?? await vscode.window.showInputBox({
		ignoreFocusOut: true,
		title:
			"Optionally enter the path prefix of the instance",
	});
	if (pathPrefix === undefined) { return; }
	pathPrefix = pathPrefix.trim();
	if (!pathPrefix.startsWith("/")) {
		pathPrefix = "/" + pathPrefix;
	}
	if (pathPrefix.endsWith("/")) {
		pathPrefix = pathPrefix.slice(0, -1);
	}
	const authMethod = (await vscode.window.showQuickPick(
		[
			{ label: "Basic", description: "Username/password" },
			{ label: "OAuth2", description: "OAuth2/OpenID Connect" },
			{ label: "Unauthenticated", description: "Not recommended. Only use when your server is configured to allow it." },
		] as const,
		{ ignoreFocusOut: true, title: "Select the authentication method" },
	))?.label;
	if (authMethod === undefined) { return; }
	let authDetails: Pick<IServerSetting, "username" | "oauth2">;
	if (authMethod === "OAuth2") {
		const authority = (await promptOAuth2Authority(name))?.trim();
		if (!authority) { return; }
		const clientId = (await promptOAuth2ClientId(name))?.trim();
		if (!clientId) { return; }
		authDetails = { oauth2: { authority, clientId } };
	} else if (authMethod === "Basic") {
		let username = await vscode.window.showInputBox({
			ignoreFocusOut: true,
			title:
				"Enter the username",
			prompt:
				"Leave empty to be prompted when connecting.",
		});
		if (username === undefined) { return; }
		username = username.trim();
		authDetails = { username };
	} else if (authMethod === "Unauthenticated") {
		authDetails = {}
	} else {
		throw Error(`Unreachable! ${authMethod} must be either "Basic Auth", "OAuth2", or "Unauthenticated".`)
	}
	const scheme = url?.scheme ?? await new Promise<string | undefined>((resolve) => {
		let result: string;
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = "Confirm the connection type, then the definition will be stored in your User Settings. 'Escape' to cancel.";
		quickPick.ignoreFocusOut = true;
		quickPick.items = [{ label: "http" }, { label: "https" }];
		quickPick.activeItems = [quickPick.items[port === "443" ? 1 : 0]];
		quickPick.onDidChangeSelection((items) => {
			result = items[0].label;
		});
		quickPick.onDidAccept(() => {
			resolve(result);
			quickPick.hide();
			quickPick.dispose();
		});
		quickPick.onDidHide(() => {
			resolve(undefined);
			quickPick.dispose();
		});
		quickPick.show();
	});
	if (scheme === undefined) { return; }
	const levelStr =
		target == vscode.ConfigurationTarget.WorkspaceFolder
			? "workspace-folder"
			: target == vscode.ConfigurationTarget.Workspace
				? "workspace"
				: "user";
	try {
		const config = vscode.workspace.getConfiguration(
			"intersystems",
			scope,
		);
		const serversInspection = config.inspect("servers");
		const servers = (
			target == vscode.ConfigurationTarget.WorkspaceFolder ? serversInspection?.workspaceFolderValue :
				target == vscode.ConfigurationTarget.Workspace ? serversInspection?.workspaceValue :
					serversInspection?.globalValue
		) ?? {};
		servers[name] = {
			webServer: { scheme, host, port: +port, pathPrefix },
			...(description ? { description } : {}),
			...authDetails,
		};
		await config.update("servers", servers, target);
		vscode.window.showInformationMessage(`Server '${name}' stored in ${levelStr}-level settings.`);
		return name;
	} catch (error) {
		vscode.window.showErrorMessage(
			`Failed to store server '${name}' definition. Does your ${levelStr}-level settings file contain a JSON syntax error?`,
		);
		return;
	}
}
