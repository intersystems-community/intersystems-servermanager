import { AuthenticationSession, AuthenticationSessionAccountInformation } from "vscode";
import { ServerManagerAuthenticationProvider } from "./authenticationProvider";
import { ResolvedAuthorization } from "@intersystems-community/intersystems-servermanager";

export class ServerManagerAuthenticationSession implements AuthenticationSession {
	public readonly id: string;
	public readonly account: AuthenticationSessionAccountInformation;
	public readonly scopes: string[];
	constructor(
		public readonly serverName: string,
		private readonly authorization: ResolvedAuthorization,
	) {
		const userName = authorization.username;
		this.id = ServerManagerAuthenticationProvider.sessionId(serverName, userName);
		this.account = { id: `${serverName}/${userName}`, label: `${userName} on ${serverName}` };
		this.scopes = [serverName, userName];
	}
	public get accessToken() {
		return this.authorization.accessToken;
	}
	public get userName() {
		return this.authorization.username;
	}
}
