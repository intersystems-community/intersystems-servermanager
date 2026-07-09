import * as vscode from "vscode";
import { IServerSpecWithAuth, VSCodeObjectScriptAPI } from "@intersystems-community/intersystems-servermanager";
import { IServerSetting } from "../serverSetting";
import { OAuth2Authorization, OBJECTSCRIPT_EXTENSIONID, PasswordAuthorization } from "../commonActivate";

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
): Promise<IServerSpecWithAuth | undefined> {
	// To avoid breaking existing users, continue to return a default server definition even after we dropped that feature
	const setting = vscode.workspace.getConfiguration("intersystems.servers", scope).get(name) as IServerSetting | undefined || legacyEmbeddedServer(name);
	// Unknown server
	if (!setting) {
		const folder = vscode.workspace.workspaceFolders?.find(f => f.name === name);
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
			auth: auth ?? new PasswordAuthorization(username, password),
			description: `Server for workspace folder "${name}"`,
		};
	}

	const { username, password, oauth2, ...spec } = setting;
	spec.name = name;
	spec.description = spec.description || "";
	spec.webServer.scheme = spec.webServer.scheme || "http";
	spec.webServer.port = spec.webServer.port || (spec.webServer.scheme === "https" ? 443 : 80);
	spec.webServer.pathPrefix = spec.webServer.pathPrefix || "";
	if (spec.superServer) {
		// Fall back to default if appropriate
		spec.superServer.host = spec.superServer.host || spec.webServer.host;
	}
	const auth = oauth2
		? new OAuth2Authorization(oauth2)
		: new PasswordAuthorization(username, password || undefined);
	return {
		...spec,
		auth,
		username: auth.username,
		password: auth.password,
	};
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
			"name": "default~iris",
			"webServer": {
				"scheme": "http",
				"host": "127.0.0.1",
				"port": 52773
			},
			"description": "Connection to local InterSystems IRIS™ installed with default settings."
		},
		"default~cache": {
			"name": "default~cache",
			"webServer": {
				"scheme": "http",
				"host": "127.0.0.1",
				"port": 57772
			},
			"description": "Connection to local InterSystems Caché installed with default settings."
		},
		"default~ensemble": {
			"name": "default~ensemble",
			"webServer": {
				"scheme": "http",
				"host": "127.0.0.1",
				"port": 57772
			},
			"description": "Connection to local InterSystems Ensemble installed with default settings."
		}
	}[name];
}

