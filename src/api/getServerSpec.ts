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
	let server: IServerSpec | undefined = vscode.workspace.getConfiguration("intersystems.servers", scope).get(name);

	// Unknown server
	if (!server) {
		return undefined;
	}

	server.name = name;
	server.description = server.description || "";
	server.webServer.scheme = server.webServer.scheme || "http";
	server.webServer.port = server.webServer.port || (server.webServer.scheme === "https" ? 443 : 80);
	server.webServer.pathPrefix = server.webServer.pathPrefix || "";


	// When authentication provider is being used we should only have a password if it came from the deprecated
	// property of the settings object. Otherwise return it as undefined.
	if (!server.password) {
		server.password = undefined;
	}
	return server;
}
