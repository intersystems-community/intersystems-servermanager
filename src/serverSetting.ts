import { IServerSpec } from "@intersystems-community/intersystems-servermanager";

export interface OAuth2Config {
	authority: string;
	clientId: string;
}

export interface IServerSetting extends Omit<IServerSpec, "authorization"> {
	username?: string;
	password?: string;
	oauth2?: OAuth2Config
};
