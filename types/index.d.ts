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

export interface IServerSpecWithAuth extends IServerSpec {
	auth: Authorization;
}

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

	defaultAuth(): Authorization;
}

export interface Authorization {
	resolved(): this is ResolvedAuthorization;
	resolve(params: { accessToken?: string; username?: string }): this is ResolvedAuthorization;
	clear(): asserts this is Authorization;
	clone(): Authorization;

	get username(): string;
	get password(): undefined | string;

	get accessToken(): undefined | string;
	get httpAuthorizationHeader(): undefined | string;
	get credentials(): undefined | { auth?: { username: string; password: string }; headers?: Record<string, string> };
}

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

export interface VSCodeObjectScriptAPI {
	serverForUri: (uri: vscode.Uri) => ServerForUri | undefined;
	asyncServerForUri: (uri: vscode.Uri) => Promise<ServerForUri | undefined>;
	serverDocumentUriForUri(uri: vscode.Uri): vscode.Uri;
	onDidChangeConnection(): vscode.Event<void>;
	getUriForDocument(document: string): vscode.Uri;
}
