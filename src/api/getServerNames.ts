import * as vscode from "vscode";
import { IServerName } from "@intersystems-community/intersystems-servermanager";
import { serverDetail } from "./getServerSummary";

export function getServerNames(scope?: vscode.ConfigurationScope, sorted?: boolean): IServerName[] {
	const allNames: IServerName[] = [];
	let names: IServerName[] = [];
	const servers = vscode.workspace.getConfiguration("intersystems", scope).get("servers");

	if (typeof servers === "object" && servers) {

		// If a valid default has been set, add it first
		const myDefault: string = servers["/default"] || "";
		if (myDefault.length > 0 && servers[myDefault]) {
			allNames.push({
				description: `${servers[myDefault].description || ""} (default)`.trim(),
				detail: serverDetail(servers[myDefault]),
				name: myDefault,
			});
		}

		// Process the rest
		for (const key in servers) {
			if (!key.startsWith("/") && key !== myDefault) {
				names.push({
					description: servers[key].description || "",
					detail: serverDetail(servers[key]),
					name: key,
				});
			}
		}
	}

	// If requested, sort what we found
	if (sorted) {
		names = names.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	}

	// Append them
	allNames.push(...names);
	return allNames;
}
