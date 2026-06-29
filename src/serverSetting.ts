import { GeneralIServerSpec as GeneralIServerSetting, PasswordAuthorization } from "@intersystems-community/intersystems-servermanager";

export interface OAuth2Config {
	authority: string;
	clientId: string;
}

export type PasswordIServerSetting = GeneralIServerSetting & PasswordAuthorization;
export type OAuth2IServerSetting = GeneralIServerSetting & { oauth2: OAuth2Config };
export type IServerSetting = PasswordIServerSetting | OAuth2IServerSetting;
