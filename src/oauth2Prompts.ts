import * as vscode from "vscode";

/**
 * Prompt the user to select an authentication method (password or oauth2).
 * Returns "password", "oauth2", or undefined if cancelled.
 */
export async function promptAuthMethod(): Promise<string | undefined> {
	return await new Promise<string | undefined>((resolve) => {
		const quickPick = vscode.window.createQuickPick();
		quickPick.title = "Select the authentication method";
		quickPick.ignoreFocusOut = true;
		quickPick.items = [
			{ label: "password", description: "Classic username/password authentication" },
			{ label: "oauth2", description: "OAuth2/OpenID Connect (e.g., Auth0, Keycloak)" },
		];
		quickPick.activeItems = [quickPick.items[0]];
		let result: string | undefined;
		quickPick.onDidChangeSelection((items) => {
			result = items[0].label;
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

/**
 * Prompt the user for the OAuth2 authority URL.
 * Returns the trimmed URL without trailing slash, or undefined if cancelled.
 */
export async function promptOAuth2Authority(serverName: string): Promise<string | undefined> {
	const entered = await vscode.window.showInputBox({
		ignoreFocusOut: true,
		title: `OAuth2 Configuration for '${serverName}'`,
		prompt: "Enter the OAuth2 authority URL (issuer)",
		placeHolder: "https://your-identity-provider.com",
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

/**
 * Prompt the user for the OAuth2 client ID.
 * Returns the entered value, or undefined if cancelled.
 */
export async function promptOAuth2ClientId(serverName: string): Promise<string | undefined> {
	return await vscode.window.showInputBox({
		ignoreFocusOut: true,
		title: `OAuth2 Configuration for '${serverName}'`,
		prompt: "Enter the OAuth2 client ID for this application",
		placeHolder: "your-client-id",
	}) || undefined;
}

/**
 * Prompt the user for the OAuth2 audience.
 * Pre-fills with defaultAudience if provided.
 * Returns the entered value, or undefined if cancelled.
 */
export async function promptOAuth2Audience(serverName: string, defaultAudience: string): Promise<string | undefined> {
	return await vscode.window.showInputBox({
		ignoreFocusOut: true,
		title: `OAuth2 Configuration for '${serverName}'`,
		prompt: "Enter the audience (API identifier registered with your IdP)",
		placeHolder: defaultAudience || "https://your-iris-server/",
		value: defaultAudience,
	}) || undefined;
}
