"use strict";

import * as vscode from "vscode";
import { importFromRegistry } from "./commands/importFromRegistry";
import { ServerManagerView } from "./ui/serverManagerView";
import { commonActivate, extensionId } from "./commonActivate";

export function activate(context: vscode.ExtensionContext) {
	const view = new ServerManagerView(context);

	// importServers command is only supported in a node environment
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.importServers`, async () => {
			await importFromRegistry(context.secrets);
			view.refreshTree();
		}),
	);

	// Common activation steps
	return commonActivate(context, view);
}

export function deactivate() { }
