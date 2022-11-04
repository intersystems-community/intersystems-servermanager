export declare const EXTENSION_ID = 'intersystems-community.servermanager';
export declare const AUTHENTICATION_PROVIDER = 'intersystems-server-credentials';

export interface IServerName {
	name: string;
	description: string;
	detail: string;
}

export interface IWebServerSpec {
	scheme?: string;
	host: string;
	port: number;
	pathPrefix?: string;
}

export interface IJSONServerSpec {
	webServer: IWebServerSpec;
	username?: string;
	password?: string;
	description?: string;
}

export interface IServerSpec extends IJSONServerSpec {
	name: string;
}
