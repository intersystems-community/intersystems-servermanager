import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

/** Create the "Server Manager" output channel. Call once during activation. */
export function initLogger(context: vscode.ExtensionContext): void {
	if (!channel) {
		channel = vscode.window.createOutputChannel("InterSystems Server Manager");
		context.subscriptions.push(channel);
	}
}

export function log(message: string): void {
	channel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}
