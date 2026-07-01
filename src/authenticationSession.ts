import { AuthenticationSession, AuthenticationSessionAccountInformation } from "vscode";
import { ServerManagerAuthenticationProvider } from "./authenticationProvider";
import { ResolvedAuthorization } from "./commonActivate";

export class ServerManagerAuthenticationSession implements AuthenticationSession {
	public readonly id: string;
	public readonly account: AuthenticationSessionAccountInformation;
	public readonly scopes: string[];
	constructor(
		public readonly serverName: string,
		public readonly auth: ResolvedAuthorization,
	) {
		this.id = ServerManagerAuthenticationProvider.sessionId(serverName, auth.username);
		this.account = { id: `${serverName}/${auth.username}`, label: `${auth.username} on ${serverName}` };
		this.scopes = [serverName, (auth.username)];
	}
	public get accessToken() {
		return this.auth.accessToken;
	}
	public get userName() {
		return this.auth.username;
	}
}
