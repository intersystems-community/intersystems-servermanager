import { IServerSpec, IWebServerSpec, Authorization, VSCodeObjectScriptAPI } from "@intersystems-community/intersystems-servermanager";
import axios from "axios";
import * as vscode from "vscode";
import { OAuth2Authorization, OBJECTSCRIPT_EXTENSIONID, BasicAuthorization } from "../commonActivate";
import { IServerSetting, updateConfig } from "../serverSetting";
import { logger } from "../logger";
import { atelierTarget } from "../atelier";

/** A spec as returned by getServerSpec: web server defaults applied and credentials configuration turned into `auth`. */
export type NormalizedServerSpec = IServerSpec & { auth: Authorization; webServer: Required<IWebServerSpec> };

const firstTimed = new Set<string>();
function isFirstTime(scope: vscode.ConfigurationScope | undefined, { name, webServer }: Pick<NormalizedServerSpec, "name" | "webServer">): boolean {
	const { scheme, host, port, pathPrefix } = webServer;
	const uri = scope instanceof vscode.Uri ? scope : scope?.uri;
	const folder = uri && vscode.workspace.getWorkspaceFolder(uri)?.uri.toString();
	const id = `${folder ?? ""}|${name}@${scheme}://${host}:${port}${pathPrefix}`;
	if (firstTimed.has(id)) {
		return false;
	} else {
		firstTimed.add(id);
		return true;
	}
}

/** Probe whether the endpoint allows unauthenticated access. */
async function allowsUnknownUser(webServer: NormalizedServerSpec["webServer"]): Promise<boolean> {
	try {
		const { url, httpsAgent } = atelierTarget(webServer);
		const response = await axios.get(encodeURI(url), { httpsAgent, validateStatus: () => true });
		const cookies: string[] = response.headers["set-cookie"] ?? [];
		if (cookies.length > 0) {
			axios.head(encodeURI(`${url}?CacheLogout=end`), { httpsAgent, validateStatus: () => true, headers: { Cookie: cookies.join("; ") } })
				.catch((error) => logger?.warn(`Probed ${url} for unauthenticated access (to record username 'UnknownUser') but failed to end the server session it opened: ${error}`));
		}
		// Require a genuine Atelier server-info document, so a proxy or login page answering 200 is not mistaken for access
		return response.status === 200 && Array.isArray(response.data?.result?.content?.namespaces);
	} catch {
		return false;
	}
}

/** Probe once per session in the background and record UnknownUser if the server allows it. */
async function tryRecordUnknownUser(scope: vscode.ConfigurationScope | undefined, { name, webServer }: Pick<NormalizedServerSpec, "name" | "webServer">): Promise<void> {
	try {
		if (!await allowsUnknownUser(webServer)) {
			return;
		}
		let written = false;
		await updateConfig(scope, (targets) => {
			for (const [key, servers] of Object.entries(targets)) {
				if (servers?.[name] && !servers[name].username) {
					written = true;
					return { [key]: { ...servers, [name]: { ...servers[name], username: "UnknownUser" } } };
				}
			}
			return {};
		});
		if (written) {
			vscode.window.showInformationMessage(
				`Server '${name}' allowed unauthenticated access, so its 'username' setting has been set to 'UnknownUser'. A future release will always prompt for a username when none is set.`,
				"Dismiss",
			);
		}
	} catch (error) {
		logger?.warn(`Failed to set username of '${name}' to UnknownUser: ${error}`);
	}
}

/**
 * Get a server specification.
 *
 * @param name The name.
 * @param scope The settings scope to use for the lookup.
 * @returns Server specification or undefined.
 */
export async function getServerSpec(
	name: string,
	scope?: vscode.ConfigurationScope,
): Promise<NormalizedServerSpec | undefined> {
	// To avoid breaking existing users, continue to return a default server definition even after we dropped that feature
	const settingFromConfig = vscode.workspace.getConfiguration("intersystems.servers", scope).get<IServerSetting>(name);
	const setting = settingFromConfig || legacyEmbeddedServer(name);
	// Unknown server
	if (!setting) {
		const folder = vscode.workspace.workspaceFolders?.find((f) => f.name === name);
		if (!folder) {
			return undefined;
		}

		// It is the name of a workspace root folder
		// Get the server details from the ObjectScript extension if available
		const objectScriptExtension = vscode.extensions.getExtension<VSCodeObjectScriptAPI>(OBJECTSCRIPT_EXTENSIONID);
		if (!objectScriptExtension?.isActive) {
			// Activating it here would cause a deadlock because the activate method of the ObjectScript extension itself calls our getServerSpec API
			return undefined;
		}
		const serverForUri = objectScriptExtension.exports.asyncServerForUri
			? await objectScriptExtension.exports.asyncServerForUri(folder.uri)
			: objectScriptExtension.exports.serverForUri(folder.uri);
		if (!serverForUri) {
			return undefined;
		}
		const { serverName, scheme, host, port, pathPrefix, auth, username, password } = serverForUri;
		return {
			name: serverName,
			webServer: {
				scheme,
				host,
				port,
				pathPrefix,
			},
			username: username ?? auth?.username,
			password: (password ?? auth?.password) || undefined,
			auth: auth ?? new BasicAuthorization(username, password),
			description: `Server for workspace folder "${name}"`,
		};
	} else {
		// Found a setting
		const { username, password, oauth2, webServer, ...kept } = setting;
		const scheme = webServer.scheme || "http";
		const spec = {
			...kept,
			name,
			description: kept.description || "",
			webServer: { ...webServer, scheme, port: webServer.port || (scheme === "https" ? 443 : 80), pathPrefix: webServer.pathPrefix || "" },
		};
		if (spec.superServer) {
			// Fall back to default if appropriate
			spec.superServer.host = spec.superServer.host || spec.webServer.host;
		}
		const auth = oauth2
			? new OAuth2Authorization(oauth2)
			: new BasicAuthorization(username, username ? password : undefined);
		// Only a stored definition can be updated; legacy embedded servers have nowhere to record UnknownUser
		if (settingFromConfig && !oauth2 && !username && !password && isFirstTime(scope, spec)) {
			tryRecordUnknownUser(scope, spec);
		}
		return {
			...spec,
			auth,
			username: auth.username,
			password: auth.password,
		};
	}
}

/**
 * If name is one of the embedded server definitions we previously (pre-3.4.2) specified in the "default" section of the "intersystems.servers"
 * object spec in package.json then return what getConfiguration() would have returned.
 *
 * @param name The name.
 * @returns Server specification or undefined.
 */
export function legacyEmbeddedServer(name: string): IServerSetting | undefined {
	return {
		"default~iris": {
			webServer: {
				scheme: "http",
				host: "127.0.0.1",
				port: 52773,
			},
			description: "Connection to local InterSystems IRIS™ installed with default settings.",
		},
		"default~cache": {
			webServer: {
				scheme: "http",
				host: "127.0.0.1",
				port: 57772,
			},
			description: "Connection to local InterSystems Caché installed with default settings.",
		},
		"default~ensemble": {
			webServer: {
				scheme: "http",
				host: "127.0.0.1",
				port: 57772,
			},
			description: "Connection to local InterSystems Ensemble installed with default settings.",
		},
	}[name];
}
