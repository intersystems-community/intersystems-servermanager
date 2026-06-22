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

interface GeneralIServerSpec {
	name: string;
	webServer: IWebServerSpec;
	superServer?: ISuperServerSpec;
	description?: string;
}

interface PasswordIServerSpec extends GeneralIServerSpec {
	authMethod?: "password";
	username?: string;
	password?: string;
}

interface OAuth2IServerSpec extends GeneralIServerSpec {
	authMethod: "oauth2";
	username: "OAuth2User";
	oauth2: {
		authority: string;
		clientId: string;
	};
}

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
}
