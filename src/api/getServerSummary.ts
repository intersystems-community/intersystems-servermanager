import * as vscode from "vscode";
import { IServerName, IServerSpec } from "../extension";

export function getServerSummary(name: string, scope?: vscode.ConfigurationScope): IServerName | undefined {
	const server: IServerSpec | undefined = vscode.workspace.getConfiguration("intersystems.servers", scope).get(name);
	if (!server) {
		return undefined;
	}
	return { name, description: server.description || "", detail: serverDetail(server) };
}

export function serverDetail(connSpec: IServerSpec): string {
	return `${connSpec.webServer.scheme || "http"}://${connSpec.webServer.host}:${connSpec.webServer.port}${connSpec.webServer.pathPrefix || ""}/`;
}
