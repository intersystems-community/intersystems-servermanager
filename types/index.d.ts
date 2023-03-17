export const EXTENSION_ID: string;
export const AUTHENTICATION_PROVIDER: string;

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
	pathPrefix?: string;
}

export interface IServerSpec extends IJSONServerSpec {
	name: string;
}
