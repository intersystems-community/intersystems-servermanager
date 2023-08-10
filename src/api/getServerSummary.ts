import * as vscode from "vscode";
import { IServerName, IServerSpec } from "@intersystems-community/intersystems-servermanager";
import { legacyEmbeddedServer } from "./getServerSpec";

export function getServerSummary(name: string, scope?: vscode.ConfigurationScope): IServerName | undefined {
	// To avoid breaking existing users, continue to return a default server definition even after we dropped that feature
	const server: IServerSpec | undefined = vscode.workspace.getConfiguration("intersystems.servers", scope).get(name) || legacyEmbeddedServer(name);
	if (!server) {
		return undefined;
	}
	return { name, description: server.description || "", detail: serverDetail(server) };
}

export function serverDetail(connSpec: IServerSpec): string {
	return `${connSpec.webServer.scheme || "http"}://${connSpec.webServer.host}:${connSpec.webServer.port}${connSpec.webServer.pathPrefix || ""}/`;
}
