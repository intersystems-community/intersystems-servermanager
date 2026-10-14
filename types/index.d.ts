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

export interface IOAuth2Spec {
	authority: string;
	clientId: string;
}

/** One entry of the 'intersystems.servers' setting; the server name is the key. */
export interface IJSONServerSpec {
	webServer: IWebServerSpec;
	superServer?: ISuperServerSpec;
	username?: string;
	password?: string;
	oauth2?: IOAuth2Spec;
	description?: string;
}

/**
 * Processed `IJSONServerSpec`: `name` added, `oauth2` folded into `auth`, and `username`/`password` deprecated in favour of `auth`.
 */
export interface IServerSpec extends Omit<IJSONServerSpec, "oauth2"> {
	name: string;
	/**
	 * @deprecated Use `auth.username` instead. Get credentials from the `auth` property.
	 */
	username?: string;
	/**
	 * @deprecated Use `auth.password` instead. Get credentials from the `auth` property.
	 */
	password?: string;
	/** Always present in current Server Manager versions; optional for compatibility with older ones. */
	auth?: Authorization;
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
	): Promise<IServerSpec | undefined>;

	getAccount(
		serverSpec: Pick<IServerSpec, "name" | "username">,
	): vscode.AuthenticationSessionAccountInformation | undefined;

	onDidChangePassword(
	): vscode.Event<string>;

	/** Authorization to use when a server definition has no `auth` of its own.
	 * This creates a Basic Auth that needs to be resolved with username and password.
	 */
	defaultAuth?(): Authorization;
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

/** Narrowed `Authorization` known to hold usable credentials, per `resolved()`. `httpAuthorizationHeader` stays optional because UnknownUser has nothing to send. */
export interface ResolvedAuthorization extends Authorization {
	/** Empty for UnknownUser, since unauthenticated access has no credential. */
	get accessToken(): string;
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
