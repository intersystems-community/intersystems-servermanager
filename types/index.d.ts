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

export interface GeneralIServerSpec {
	name: string;
	webServer: IWebServerSpec;
	superServer?: ISuperServerSpec;
	description?: string;
}

export interface PasswordAuthorization {
	authMethod?: "password";
	username?: string;
	password?: string;
}

export interface OAuth2Authorization {
	authMethod: "oauth2";
	username?: string;
	// The token is stored as password so that IServerSpec is backward-compatible (password is always a field although optional)
	password?: string;
	oauth2: {
		authority: string;
		clientId: string;
	};
}

export type Authorization = PasswordAuthorization | OAuth2Authorization;

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
		serverSpec: IServerSpec
	): vscode.AuthenticationSessionAccountInformation | undefined;

	onDidChangePassword(
	): vscode.Event<string>;

	getAuthorization(
		authorization: Required<Pick<Authorization, keyof Authorization>>
	): String
}
