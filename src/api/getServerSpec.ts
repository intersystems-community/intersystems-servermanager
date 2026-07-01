import * as vscode from "vscode";
import { IServerSpec } from "@intersystems-community/intersystems-servermanager";
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
): Promise<IServerSpec | undefined> {
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
		const objectScriptExtension = vscode.extensions.getExtension(OBJECTSCRIPT_EXTENSIONID);
		if (!objectScriptExtension) {
			return undefined;
		}
		if (!objectScriptExtension.isActive) {
			// Activating it here would cause a deadlock because the activate method of the ObjectScript extension itself calls our getServerSpec API
			return undefined;
		}
		let serverForUri: {
			serverName: string;
			scheme: string;
			host: string;
			port: number;
			pathPrefix: string;
			username: string;
			password?: string;
		};
		if (objectScriptExtension.exports.asyncServerForUri) {
			serverForUri = await objectScriptExtension.exports.asyncServerForUri(folder.uri);
		} else {
			serverForUri = objectScriptExtension.exports.serverForUri(folder.uri);
		}
		if (!serverForUri) {
			return undefined;
		}
		return {
			name: serverForUri.serverName,
			webServer: {
				scheme: serverForUri.scheme,
				host: serverForUri.host,
				port: serverForUri.port,
				pathPrefix: serverForUri.pathPrefix,
			},
			authorization: new PasswordAuthorization(serverForUri.username, serverForUri.password),
			description: `Server for workspace folder "${name}"`,
		};
	}

	const { oauth2, username, password, ...spec } = setting;
	spec.name = name;
	spec.description = spec.description || "";
	spec.webServer.scheme = spec.webServer.scheme || "http";
	spec.webServer.port = spec.webServer.port || (spec.webServer.scheme === "https" ? 443 : 80);
	spec.webServer.pathPrefix = spec.webServer.pathPrefix || "";
	if (spec.superServer) {
		// Fall back to default if appropriate
		spec.superServer.host = spec.superServer.host || spec.webServer.host;
	}
	return {
		...spec,
		authorization: (oauth2 === undefined)
			? new PasswordAuthorization(username || "", password)
			: new OAuth2Authorization(oauth2)
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

