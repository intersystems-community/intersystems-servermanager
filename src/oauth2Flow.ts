import axios from "axios";
import * as vscode from "vscode";
import { logger } from "./logger";

export interface IOAuth2Config {
	authority: string;
	clientId: string;
	audience: string;
}

export interface IOAuth2TokenSet {
	accessToken: string;
	/** Kept privately by Server Manager; never shared with consumers of the access token. */
	refreshToken?: string;
	/** Epoch milliseconds at which the access token should be treated as expired. */
	expiresAt?: number;
}

async function discoverEndpoints(label: string, authority: string): Promise<{ authorizationEndpoint: string; tokenEndpoint: string } | undefined> {
	const discoveryUrl = `${authority}/.well-known/openid-configuration`;
	try {
		const discovery = await axios.get(discoveryUrl);
		return {
			authorizationEndpoint: discovery.data.authorization_endpoint,
			tokenEndpoint: discovery.data.token_endpoint,
		};
	} catch (err: any) {
		logger?.error(`OAuth2 [${label}]: discovery failed - ${err.message}`);
		vscode.window.showErrorMessage(`OAuth2: Failed to discover endpoints from ${discoveryUrl}`, "Dismiss");
		return undefined;
	}
}

function tokenSetFromResponse(label: string, data: any): IOAuth2TokenSet | undefined {
	if (!data.access_token) { return undefined; }
	logger?.debug(`OAuth2 [${label}]: received token (expires_in=${data.expires_in ?? "n/a"}, refresh_token ${data.refresh_token ? "present" : "absent"})`);
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		// Refresh early to avoid using a token that expires mid-request: 60s margin,
		// but never more than 10% of a short-lived token's lifetime so we don't refresh constantly.
		expiresAt: data.expires_in ? Date.now() + (data.expires_in - Math.min(60, data.expires_in * 0.1)) * 1000 : undefined,
	};
}

/**
 * Perform an OAuth2 Authorization Code + PKCE flow: open the browser for login,
 * listen for the callback, exchange the code for an access token (and refresh token if issued).
 */
export async function performOAuth2Login(label: string, config: IOAuth2Config): Promise<IOAuth2TokenSet | undefined> {
	logger?.info(`OAuth2 [${label}]: starting interactive login`);
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	const state = generateRandomHex(32); // CSRF protection

	const endpoints = await discoverEndpoints(label, config.authority);
	if (!endpoints) { return undefined; }
	const { authorizationEndpoint, tokenEndpoint } = endpoints;

	const callbackUri = vscode.Uri.parse(`${vscode.env.uriScheme}://intersystems-community.servermanager/oauth2-callback`);

	// "offline_access" requests a refresh token so we can renew silently
	const scopes = ["openid", "profile", "email", "offline_access"];
	const authUrl = new URL(authorizationEndpoint);
	authUrl.searchParams.set("client_id", config.clientId);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("redirect_uri", callbackUri.toString());
	authUrl.searchParams.set("scope", scopes.join(" "));
	authUrl.searchParams.set("audience", config.audience);
	authUrl.searchParams.set("state", state);
	authUrl.searchParams.set("code_challenge", codeChallenge);
	authUrl.searchParams.set("code_challenge_method", "S256");

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
					vscode.window.showErrorMessage(`OAuth2 error: ${error} - ${query.get("error_description") || ""}`, { modal: true }, "Dismiss");
					resolve(undefined);
				} else if (returnedState !== state) {
					vscode.window.showErrorMessage("OAuth2: State mismatch. Possible CSRF attack.", { modal: true }, "Dismiss");
					resolve(undefined);
				} else {
					resolve(code || undefined);
				}
			},
		});

		// Auto-cancel after 2 minutes
		const timeoutHandle = setTimeout(() => {
			disposable.dispose();
			vscode.window.showWarningMessage("OAuth2: Login timed out. Please try again.", { modal: true }, "Dismiss");
			resolve(undefined);
		}, 120000);
	});

	await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

	const code = await codePromise;
	if (!code) { return undefined; }

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
		const tokenSet = tokenSetFromResponse(label, tokenResponse.data);
		if (!tokenSet) {
			vscode.window.showErrorMessage("OAuth2: No access token in response", "Dismiss");
		}
		return tokenSet;
	} catch (err: any) {
		const detail = err.response?.data?.error_description || err.message;
		logger?.error(`OAuth2 [${label}]: token exchange failed - ${detail}`);
		vscode.window.showErrorMessage(`OAuth2: Token exchange failed - ${detail}`, "Dismiss");
		return undefined;
	}
}

/**
 * Renew an access token using a refresh token.
 * @returns The new token set (carrying the rotated or existing refresh token), or undefined if the refresh token is invalid/expired.
 */
export async function refreshOAuth2Token(label: string, config: IOAuth2Config, refreshToken: string): Promise<IOAuth2TokenSet | undefined> {
	logger?.info(`OAuth2 [${label}]: refreshing access token`);
	const endpoints = await discoverEndpoints(label, config.authority);
	if (!endpoints) { return undefined; }
	try {
		const tokenResponse = await axios.post(endpoints.tokenEndpoint, new URLSearchParams({
			grant_type: "refresh_token",
			client_id: config.clientId,
			refresh_token: refreshToken,
		}).toString(), {
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		});
		const tokenSet = tokenSetFromResponse(label, tokenResponse.data);
		// If the provider did not rotate the refresh token, keep the existing one
		if (tokenSet && !tokenSet.refreshToken) { tokenSet.refreshToken = refreshToken; }
		return tokenSet;
	} catch (err: any) {
		// Refresh token expired or revoked - caller falls back to interactive login
		logger?.error(`OAuth2 [${label}]: refresh failed - ${err.response?.data?.error_description || err.message}`);
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
