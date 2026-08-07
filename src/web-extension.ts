"use strict";

import * as vscode from "vscode";
import { commonActivate } from "./commonActivate";
import { logout, serverSessions } from "./makeRESTRequest";
import { ServerManagerView } from "./ui/serverManagerView";

export function activate(context: vscode.ExtensionContext) {
	const view = new ServerManagerView(context);

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
