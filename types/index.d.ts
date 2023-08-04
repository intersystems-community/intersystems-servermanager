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

export interface ISuperServerSpec {
	host?: string;
	port: number;
}

export interface IJSONServerSpec {
	webServer: IWebServerSpec;
	superServer?: ISuperServerSpec;
	username?: string;
	password?: string;
	description?: string;
}

export interface IServerSpec extends IJSONServerSpec {
	name: string;
}
