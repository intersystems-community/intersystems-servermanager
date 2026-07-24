import * as vscode from "vscode";

/** Prompt for the OAuth2 authority URL, trimmed of any trailing slash. */
export async function promptOAuth2Authority(serverName: string): Promise<string | undefined> {
	const entered = await vscode.window.showInputBox({
		ignoreFocusOut: true,
		title: `OAuth2 Configuration for '${serverName}'`,
		prompt: "Enter the OAuth2 authority URL (issuer)",
		validateInput: (v) => {
			if (!v.startsWith("https://") && !v.startsWith("http://")) {
				return "Must be a URL starting with https:// or http://";
			}
			return undefined;
		},
	});
	if (!entered) { return undefined; }
	return entered.replace(/\/+$/, "");
}

/** Prompt for the OAuth2 client ID. */
export async function promptOAuth2ClientId(serverName: string): Promise<string | undefined> {
	return await vscode.window.showInputBox({
		ignoreFocusOut: true,
		title: `OAuth2 Configuration for '${serverName}'`,
		prompt: "Enter the OAuth2 client ID for this application",
	});
}
