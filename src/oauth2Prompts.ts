import * as vscode from "vscode";

/** Prompt for the authentication method, or undefined if cancelled. */
export async function promptAuthMethod(): Promise<"password" | "oauth2" | undefined> {
	return await new Promise((resolve) => {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = "Select the authentication method";
		quickPick.ignoreFocusOut = true;
		quickPick.items = [
			{ label: "password", description: "Classic username/password authentication" },
			{ label: "oauth2", description: "OAuth2/OpenID Connect (e.g., Auth0, Keycloak)" },
		];
		quickPick.activeItems = [quickPick.items[0]];
		let result: "password" | "oauth2" = "password";
		quickPick.onDidChangeSelection((items) => {
			result = items[0].label as typeof result;
		});
		quickPick.onDidAccept(() => {
			resolve(result);
			quickPick.hide();
			quickPick.dispose();
		});
		quickPick.onDidHide(() => {
			resolve(undefined);
			quickPick.dispose();
		});
		quickPick.show();
	});
}

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
