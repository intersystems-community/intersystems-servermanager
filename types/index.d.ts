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

export interface PasswordAuthorization {
	// The properties are present only if defined in the settings JSON.
	//   Storage of `password` there is deprecated and strongly discouraged.
	username?: string;
	password?: string;
}

export interface OAuth2Authorization {
	// The bearer_token is never present by getServerSpec for now.
	bearer_token: string | undefined;
}

export type Authorization = PasswordAuthorization | OAuth2Authorization;

export interface GeneralIJSONServerSpec {
	webServer: IWebServerSpec;
	superServer?: ISuperServerSpec;
	description?: string;
}

export type IJSONServerSpec = GeneralIJSONServerSpec & Authorization;

export interface GeneralIServerSpec extends GeneralIJSONServerSpec {
	name: string;
}
export type PasswordIServerSpec = GeneralIServerSpec & PasswordAuthorization;
export type OAuth2IServerSpec = GeneralIServerSpec & OAuth2Authorization;
export type IServerSpec = PasswordIServerSpec | OAuth2IServerSpec;

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
		serverSpec: { name: string, username?: string }
	): vscode.AuthenticationSessionAccountInformation | undefined;

	onDidChangePassword(
	): vscode.Event<string>;

	getAuthorization(
		authorization: Required<Authorization>
	): string
}
