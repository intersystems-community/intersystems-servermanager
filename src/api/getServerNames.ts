import * as vscode from "vscode";
import { IServerName } from "../extension";
import { serverDetail } from "./getServerSummary";

export function getServerNames(scope?: vscode.ConfigurationScope, sorted?: boolean): IServerName[] {
	const allNames: IServerName[] = [];
	let names: IServerName[] = [];
	const embeddedNames: IServerName[] = [];
	const servers = vscode.workspace.getConfiguration("intersystems", scope).get("servers");

	if (typeof servers === "object" && servers) {
		// Helper function to return true iff inspected setting is not explicitly set at any level
		const notSet = (inspected): boolean => {
			return !inspected?.globalLanguageValue
				&& !inspected?.globalValue
				&& !inspected?.workspaceFolderLanguageValue
				&& !inspected?.workspaceFolderValue
				&& !inspected?.workspaceLanguageValue
				&& !inspected?.workspaceValue;
		};

		// If a valid default has been explicitly nominated, add it first
		const inspectedDefault = vscode.workspace.getConfiguration("intersystems.servers", scope).inspect("/default");
		const myDefault: string = notSet(inspectedDefault) ? "" : servers["/default"] || "";
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
				const inspected = vscode.workspace.getConfiguration("intersystems.servers", scope).inspect(key);

				// Collect embedded (default~*) servers separately
				if (notSet(inspected)) {
					embeddedNames.push({
						description: servers[key].description || "",
						detail: serverDetail(servers[key]),
						name: key,
					});
				} else {
					names.push({
						description: servers[key].description || "",
						detail: serverDetail(servers[key]),
						name: key,
					});
				}
			}
		}
	}

	// If requested, sort what we found
	if (sorted) {
		names = names.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	}

	// Append them
	allNames.push(...names);

	// Append the embedded servers unless suppressed
	if (!vscode.workspace.getConfiguration("intersystems.servers", scope).get("/hideEmbeddedEntries")) {
		allNames.push(...embeddedNames);
	}
	return allNames;
}
