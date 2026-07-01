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
	username?: string,
	password?: string,
	authorization: Authorization;
	description?: string;
}

export interface IServerSpec extends IJSONServerSpec {
	name: string;
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
	): Promise<IServerSpec | undefined>;

	getAccount(
		serverSpec: Pick<IServerSpec, "name" | "username">,
	): vscode.AuthenticationSessionAccountInformation | undefined;

	onDidChangePassword(
	): vscode.Event<string>;

	makeAuthorization(
		username?: string,
		password?: string,
	): Authorization;
}

export class Authorization {
	public resolved(): this is ResolvedAuthorization;
	public resolve(accessToken: string, username?: string): this is ResolvedAuthorization;
	public get username(): string;
	public get password(): string | undefined;
	public clone(): Authorization;
	public get httpAuthorizationHeader(): undefined | string;
	public get credentials(): undefined | { auth?: { username: string; password: string }; headers?: Record<string, string> };
}

export class ResolvedAuthorization extends Authorization {
	public get httpAuthorizationHeader(): string;
	public get credentials(): { auth?: { username: string; password: string }; headers?: Record<string, string> };
}
