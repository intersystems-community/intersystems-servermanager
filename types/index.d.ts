import * as vscode from 'vscode';

export const EXTENSION_ID: string;
export const AUTHENTICATION_PROVIDER: string;

export interface IServerName {
	name: string;
	description: string;
	detail: string;
	scope?: vscode.ConfigurationScope;
}

export interface IWebServerSpec {
	scheme?: string;
	host: string;
	port: number;
	pathPrefix?: string;
}

export interface ISuperServerSpec {
	host?: string;
	port: number;
}

export interface IJSONServerSpec {
	webServer: IWebServerSpec;
	superServer?: ISuperServerSpec;
	/**
	 * @deprecated Use `auth.username` instead. Get credentials from the `auth` property.
	 */
	username?: string;
	/**
	 * @deprecated Use `auth.password` instead. Get credentials from the `auth` property.
	 */
	password?: string;
	auth?: Authorization;
	description?: string;
}

export interface IServerSpec extends IJSONServerSpec {
	name: string;
}

/** IServerSpec with `auth` guaranteed to be present. */
export interface IServerSpecWithAuth extends IServerSpec {
	auth: Authorization;
}

/** API to the Server Manager extension */
export interface ServerManagerAPI {
	pickServer(
		scope?: vscode.ConfigurationScope,
		options?: vscode.QuickPickOptions,
	): Promise<string | undefined>;

	getServerNames(
		scope?: vscode.ConfigurationScope,
		sorted?: boolean,
	): IServerName[];

	getServerSummary(
		name: string,
		scope?: vscode.ConfigurationScope,
	): IServerName | undefined;

	getServerSpec(
		name: string,
		scope?: vscode.ConfigurationScope,
		flushCredentialCache?: boolean,
		options?: { hideFromRecents?: boolean, /* Obsolete */ noCredentials?: boolean },
	): Promise<IServerSpecWithAuth | undefined>;

	getAccount(
		serverSpec: Pick<IServerSpec, "name" | "username">,
	): vscode.AuthenticationSessionAccountInformation | undefined;

	onDidChangePassword(
	): vscode.Event<string>;

	/** Authorization to use when a server definition has no `auth` of its own.
	 * This creates a Basic Auth that needs to be resolved with username and password.
	 */
	defaultAuth(): Authorization;
}

/**
 * Represents a server's authentication state and how to apply it to a request.
 * Implementations exist for basic auth (username/password) and OAuth2 (bearer token).
 */
export interface Authorization {
	/** Whether enough credentials are present to authenticate a request. */
	resolved(): this is ResolvedAuthorization;
	/** Supplies missing credentials (e.g. from a prompt or token exchange); returns the new `resolved()` state. */
	resolve(params: { accessToken?: string; username?: string }): this is ResolvedAuthorization;
	/** Discards the resolved secret (password/token), reverting to an unresolved state. */
	clear(): asserts this is Authorization;
	/** Returns an independent copy carrying the same credentials. */
	clone(): Authorization;

	/** The IRIS username or "*OAuth2*" if authorized with OAuth2 */
	get username(): string;
	get password(): undefined | string;

	get accessToken(): undefined | string;
	get httpAuthorizationHeader(): undefined | string;
	get credentials(): undefined | { auth?: { username: string; password: string }; headers?: Record<string, string> };
}

/** Narrowed `Authorization` known to hold usable credentials, per `resolved()`. */
export interface ResolvedAuthorization extends Authorization {
	get accessToken(): string;
	get httpAuthorizationHeader(): string;
	get credentials(): { auth?: { username: string; password: string }; headers?: Record<string, string> };
}

export interface ServerForUri {
	serverName: string;
	active: boolean;
	apiVersion: number;
	serverVersion: string;
	scheme: "http" | "https";
	https?: boolean;
	host: string;
	port: number;
	superserverPort?: number;
	pathPrefix: string;
	auth?: Authorization;
	/**
	 * @deprecated Use `auth.username` instead. Get credentials from the `auth` property.
	 */
	username?: string;
	/**
	 * @deprecated Use `auth.password` instead. Get credentials from the `auth` property.
	 */
	password?: string;
	namespace: string;
}

/** API to the VSCode ObjectScript extension */
export interface VSCodeObjectScriptAPI {
	serverForUri: (uri: vscode.Uri) => ServerForUri | undefined;
	asyncServerForUri: (uri: vscode.Uri) => Promise<ServerForUri | undefined>;
	serverDocumentUriForUri(uri: vscode.Uri): vscode.Uri;
	onDidChangeConnection(): vscode.Event<void>;
	getUriForDocument(document: string): vscode.Uri;
}
