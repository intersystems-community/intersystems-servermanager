import * as vscode from "vscode";
import { IServerSpec } from "@intersystems-community/intersystems-servermanager";

interface ICredentialSet {
	username: string;
	password: string;
}

export let credentialCache = new Map<string, ICredentialSet>();

/**
 * Get a server specification.
 *
 * @param name The name.
 * @param scope The settings scope to use for the lookup.
 * @param flushCredentialCache Flush the session's cache of credentials obtained from keystore and/or user prompting.
 * @param noCredentials Set username and password as undefined; do not fetch credentials from anywhere.
 * @returns Server specification or undefined.
 */
export async function getServerSpec(
	name: string,
	scope?: vscode.ConfigurationScope,
	flushCredentialCache: boolean = false,
	noCredentials: boolean = false,
): Promise<IServerSpec | undefined> {
	if (flushCredentialCache) {
		credentialCache[name] = undefined;
	}
	// To avoid breaking existing users, continue to return a default server definition even after we dropped that feature
	let server: IServerSpec | undefined = vscode.workspace.getConfiguration("intersystems.servers", scope).get(name) || legacyEmbeddedServer(name);

	// Unknown server
	if (!server) {
		return undefined;
	}

	server.name = name;
	server.description = server.description || "";
	server.webServer.scheme = server.webServer.scheme || "http";
	server.webServer.port = server.webServer.port || (server.webServer.scheme === "https" ? 443 : 80);
	server.webServer.pathPrefix = server.webServer.pathPrefix || "";
	if (server.superServer) {
		// Fall back to default if appropriate
		server.superServer.host = server.superServer.host || server.webServer.host;
	}


	// When authentication provider is being used we should only have a password if it came from the deprecated
	// property of the settings object. Otherwise return it as undefined.
	if (!server.password) {
		server.password = undefined;
	}
	return server;
}

/**
 * If name is one of the embedded server definitions we previously (pre-3.4.2) specified in the "default" section of the "intersystems.servers"
 * object spec in package.json then return what getConfiguration() would have returned.
 *
 * @param name The name.
 * @returns Server specification or undefined.
 */
export function legacyEmbeddedServer(name: string): IServerSpec | undefined {
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

