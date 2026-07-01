import * as vscode from "vscode";
import { IServerName } from "@intersystems-community/intersystems-servermanager";
import { legacyEmbeddedServer } from "./getServerSpec";
import { IServerSetting } from "../serverSetting";

export function getServerSummary(name: string, scope?: vscode.ConfigurationScope): IServerName | undefined {
	// To avoid breaking existing users, continue to return a default server definition even after we dropped that feature
	const server = vscode.workspace.getConfiguration("intersystems.servers", scope).get(name) as IServerSetting | undefined || legacyEmbeddedServer(name);
	if (!server) {
		return undefined;
	}
	return { name, description: server.description || "", detail: serverDetail(server), scope };
}

export function serverDetail(connSpec: IServerSetting): string {
	return `${connSpec.webServer.scheme || "http"}://${connSpec.webServer.host}:${connSpec.webServer.port}${connSpec.webServer.pathPrefix || ""}/`;
}
