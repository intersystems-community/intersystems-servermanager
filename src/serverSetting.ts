import { IJSONServerSpec } from "@intersystems-community/intersystems-servermanager";
import * as vscode from "vscode";

export type ServerSettings = Record<string, IJSONServerSpec>;
/**
 * The 'intersystems.servers' value at each writable target, named as `WorkspaceConfiguration.inspect` names them and ordered
 * most specific first. An absent key is a target that cannot be written in the current scope; an `undefined` value is a
 * writable target with nothing stored yet.
 */
export type InspectedServerSettings = { workspaceFolderValue?: ServerSettings; workspaceValue?: ServerSettings; globalValue?: ServerSettings };

/** The queue for updateConfig */
let previousUpdate: Promise<void> = Promise.resolve();

/**
 * Pass the 'intersystems.servers' value at each writable target to `update` and write back the entries it returns;
 * entries with an undefined value are ignored rather than deleting the target. Updates are serialized because a target
 * can only be written whole. Resolves once every returned entry is written.
 */
export function updateConfig(
	scope: vscode.ConfigurationScope | undefined,
	update: (targets: InspectedServerSettings) => InspectedServerSettings,
): Promise<void> {
	const result = previousUpdate.then(async () => {
		const config = vscode.workspace.getConfiguration("intersystems", scope);
		const inspected = config.inspect<ServerSettings>("servers");
		const uri = scope instanceof vscode.Uri ? scope : scope?.uri;
		// Offer only the targets VS Code can write in this window and scope; writing to an absent one throws.
		const targets: InspectedServerSettings = {};
		if (uri && vscode.workspace.getWorkspaceFolder(uri)) {
			// Folder settings need the scope to resolve to a workspace folder
			targets.workspaceFolderValue = inspected?.workspaceFolderValue;
		}
		if (vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length) {
			// Workspace settings need an open folder or workspace file
			targets.workspaceValue = inspected?.workspaceValue;
		}
		targets.globalValue = inspected?.globalValue;
		for (const [key, settings] of Object.entries(update(targets))) {
			if (settings === undefined) {
				continue;
			}
			await config.update("servers", settings, {
				workspaceFolderValue: vscode.ConfigurationTarget.WorkspaceFolder,
				workspaceValue: vscode.ConfigurationTarget.Workspace,
				globalValue: vscode.ConfigurationTarget.Global,
			}[key as keyof InspectedServerSettings]);
		}
	});
	previousUpdate = result.catch(() => undefined);
	return result;
}
