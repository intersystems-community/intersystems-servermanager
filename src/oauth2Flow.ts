import axios from "axios";
import * as vscode from "vscode";

export interface IOAuth2Config {
	authority: string;
	clientId: string;
	audience: string;
}

/**
 * Perform an OAuth2 Authorization Code + PKCE flow.
 * Opens the user's browser for login, listens for the callback,
 * exchanges the code for a JWT access token.
 *
 * @param config OAuth2 configuration from the server spec
 * @returns The access token (JWT) or undefined if cancelled
 */
export async function performOAuth2Login(config: IOAuth2Config): Promise<string | undefined> {
	// Generate PKCE code verifier and challenge
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);

	// Generate state for CSRF protection
	const state = generateRandomHex(32);

	// Discover endpoints from OpenID Configuration
	const discoveryUrl = `${config.authority}/.well-known/openid-configuration`;
	let authorizationEndpoint: string;
	let tokenEndpoint: string;
	try {
		const discovery = await axios.get(discoveryUrl);
		authorizationEndpoint = discovery.data.authorization_endpoint;
		tokenEndpoint = discovery.data.token_endpoint;
	} catch (err) {
		vscode.window.showErrorMessage(`OAuth2: Failed to discover endpoints from ${discoveryUrl}`);
		return undefined;
	}

	// Build the redirect URI using VS Code's URI handler
	const callbackUri = vscode.Uri.parse(`${vscode.env.uriScheme}://intersystems-community.servermanager/oauth2-callback`);

	// Build the authorization URL
	// OpenID Connect scopes:
	// - "openid": required by OIDC spec, triggers ID token issuance
	// - "profile": includes user's name/picture in claims
	// - "email": includes user's email in claims
	// It is standard to pass those scopes although we don't need them
	const scopes = ["openid", "profile", "email"];
	const authUrl = new URL(authorizationEndpoint);
	authUrl.searchParams.set("client_id", config.clientId);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("redirect_uri", callbackUri.toString());
	authUrl.searchParams.set("scope", scopes.join(" "));
	authUrl.searchParams.set("audience", config.audience);
	authUrl.searchParams.set("state", state);
	authUrl.searchParams.set("code_challenge", codeChallenge);
	authUrl.searchParams.set("code_challenge_method", "S256");

	// Set up a promise that resolves when the callback is received
	const codePromise = new Promise<string | undefined>((resolve) => {
		const disposable = vscode.window.registerUriHandler({
			handleUri(uri: vscode.Uri): void {
				const query = new URLSearchParams(uri.query);
				const returnedState = query.get("state");
				const code = query.get("code");
				const error = query.get("error");

				disposable.dispose();
				clearTimeout(timeoutHandle);

				if (error) {
					vscode.window.showErrorMessage(`OAuth2 error: ${error} - ${query.get("error_description") || ""}`, { modal: true });
					resolve(undefined);
				} else if (returnedState !== state) {
					vscode.window.showErrorMessage("OAuth2: State mismatch. Possible CSRF attack.", { modal: true });
					resolve(undefined);
				} else {
					// Resolve immediately without showing a message
					// The auth flow will continue seamlessly in the background
					resolve(code || undefined);
				}
			},
		});

		// Auto-cancel after 2 minutes
		const timeoutHandle = setTimeout(() => {
			disposable.dispose();
			vscode.window.showWarningMessage("OAuth2: Login timed out. Please try again.", { modal: true });
			resolve(undefined);
		}, 120000);
	});

	// Open the browser for login silently
	// User doesn't need to interact with VSCode - the browser will open and redirect back
	await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

	// Wait for the authorization code
	const code = await codePromise;
	if (!code) {
		return undefined;
	}

	// Exchange the authorization code for an access token
	try {
		const tokenResponse = await axios.post(tokenEndpoint, new URLSearchParams({
			grant_type: "authorization_code",
			client_id: config.clientId,
			code,
			redirect_uri: callbackUri.toString(),
			code_verifier: codeVerifier,
		}).toString(), {
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		});

		return tokenResponse.data.access_token;
	} catch (err: any) {
		const detail = err.response?.data?.error_description || err.message;
		vscode.window.showErrorMessage(`OAuth2: Token exchange failed - ${detail}`);
		return undefined;
	}
}

function generateRandomHex(bytes: number): string {
	const array = new Uint8Array(bytes);
	globalThis.crypto.getRandomValues(array);
	return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	globalThis.crypto.getRandomValues(array);
	return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const hash = await globalThis.crypto.subtle.digest("SHA-256", data);
	return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(buffer: Uint8Array): string {
	let binary = "";
	for (const byte of buffer) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
