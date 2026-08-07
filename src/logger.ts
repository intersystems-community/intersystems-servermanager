import * as vscode from "vscode";

export let logger: vscode.LogOutputChannel | undefined;

/** Create the "InterSystems Server Manager" log channel. Call once during activation. */
export function initLogger(context: vscode.ExtensionContext): void {
	if (!logger) {
		logger = vscode.window.createOutputChannel("InterSystems Server Manager", { log: true });
		context.subscriptions.push(logger);
	}
}
