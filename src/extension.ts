"use strict";

import * as vscode from "vscode";
import { importFromRegistry } from "./commands/importFromRegistry";
import { commonActivate, extensionId } from "./commonActivate";
import { logout, serverSessions } from "./makeRESTRequest";
import { ServerManagerView } from "./ui/serverManagerView";

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

export async function deactivate() {
	// Do our best to log out of all sessions

	const promises: Array<Promise<void>> = [];
	for (const serverSession of serverSessions) {
		promises.push(logout(serverSession[1].serverName));
	}
	await Promise.allSettled(promises);
}
