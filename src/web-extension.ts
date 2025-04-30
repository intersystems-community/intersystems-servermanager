"use strict";

import * as vscode from "vscode";
import { ServerManagerView } from "./ui/serverManagerView";
import { commonActivate } from "./commonActivate";
import { logout, serverSessions } from "./makeRESTRequest";

export function activate(context: vscode.ExtensionContext) {
	const view = new ServerManagerView(context);

	// Common activation steps
	return commonActivate(context, view);
}

export async function deactivate() {
	// Do our best to log out of all sessions

	const promises: Promise<any>[] = [];
	for (const serverSession of serverSessions) {
		promises.push(logout(serverSession[1].serverName));
	}
	await Promise.allSettled(promises);
}
