import { IServerSpec } from "@intersystems-community/intersystems-servermanager";

export interface OAuth2Config {
	authority: string;
	clientId: string;
}

export interface IServerSetting extends Omit<IServerSpec, "auth"> {
	oauth2?: OAuth2Config
};

export type AuthRelatedSetting = Pick<IServerSetting, "username" | "password" | "oauth2">;
