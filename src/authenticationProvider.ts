import { Authorization, IServerSpecWithAuth, ResolvedAuthorization } from "@intersystems-community/intersystems-servermanager";
import {
	authentication,
	AuthenticationProvider,
	AuthenticationProviderAuthenticationSessionsChangeEvent,
	AuthenticationProviderSessionOptions,
	AuthenticationSession,
	Disposable,
	Event,
	EventEmitter,
	extensions,
	SecretStorage,
	ThemeIcon,
	window,
	workspace,
} from "vscode";
import { getServerSpec } from "./api/getServerSpec";
import { ServerManagerAuthenticationSession } from "./authenticationSession";
import { globalState, OAuth2Authorization, PasswordAuthorization } from "./commonActivate";
import { logger } from "./logger";
import { logout, makeRESTRequest } from "./makeRESTRequest";
import { IOAuth2Config, performOAuth2Login, refreshOAuth2Token } from "./oauth2Flow";

interface IOAuth2Secret {
	refreshToken?: string;
	/** Epoch milliseconds at which the access token should be treated as expired. */
	expiresAt?: number;
}

export const AUTHENTICATION_PROVIDER = "intersystems-server-credentials";
const AUTHENTICATION_PROVIDER_LABEL = "InterSystems Server Credentials";

interface StrippedSession {
	/** Session ID */
	id: string;
	serverName: string;
	userName: string;
}

export class ServerManagerAuthenticationProvider implements AuthenticationProvider, Disposable {
	get onDidChangeSessions(): Event<AuthenticationProviderAuthenticationSessionsChangeEvent> {
		return this._onDidChangeSessions.event;
	}
	public static id = AUTHENTICATION_PROVIDER;
	public static label = AUTHENTICATION_PROVIDER_LABEL;
	public static secretKeyPrefix = "credentialProvider:";
	public static sessionId(serverName: string, userName: string): string {
		const canonicalUserName = userName.toLowerCase();
		return `${serverName}/${canonicalUserName}`;
	}
	public static credentialKey(sessionId: string): string {
		return `${ServerManagerAuthenticationProvider.secretKeyPrefix}${sessionId}`;
	}
	// Refresh tokens are kept privately under a separate key and never exposed as an accessToken.
	public static oauth2SecretKey(sessionId: string): string {
		return `${ServerManagerAuthenticationProvider.secretKeyPrefix}${sessionId}:oauth2`;
	}
	public static oauth2Config(spec: IServerSpecWithAuth): IOAuth2Config {
		const oauth2 = (spec.auth as OAuth2Authorization).oauth2;
		return {
			authority: oauth2.authority,
			clientId: oauth2.clientId,
			audience: `${spec.webServer.scheme || "http"}://${spec.webServer.host}:${spec.webServer.port}/`,
		};
	}

	private _initializedDisposable: Disposable | undefined;

	private _sessions: ServerManagerAuthenticationSession[] = [];
	private _checkedSessions: ServerManagerAuthenticationSession[] = [];

	// Guards against concurrent refreshes of the same session, which would
	// invalidate each other when the provider rotates refresh tokens.
	private _refreshInFlight = new Map<string, Promise<string | undefined>>();

	private _serverManagerExtension = extensions.getExtension("intersystems-community.servermanager");

	private _onDidChangeSessions = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();

	constructor(private readonly secretStorage: SecretStorage) {}

	public dispose(): void {

		this._initializedDisposable?.dispose();
	}

	// This function is called first when `vscode.authentication.getSession` is called.
	public async getSessions(scopes: readonly string[] = [], options: AuthenticationProviderSessionOptions): Promise<AuthenticationSession[]> {
		await this._ensureInitialized();
		let sessions = this._sessions;

		// Filter to return only those that match all supplied scopes, which are positional and case-insensitive.
		for (let index = 0; index < scopes.length; index++) {
			sessions = sessions.filter((session) => session.scopes[index].toLowerCase() === scopes[index].toLowerCase());
		}

		if (options.account) {
			const accountParts = options.account.id.split("/");
			const serverName = accountParts.shift();
			const userName = accountParts.join("/");
			if (serverName && userName) {
				sessions = sessions.filter((session) => session.scopes[0] === serverName && session.scopes[1].toLowerCase() === userName.toLowerCase());
			}
		}

		if (sessions.length === 1) {
			if (!(await this._isStillValid(sessions[0]))) {
				sessions = [];
			}
		}
		return sessions || [];
	}

	// This function is called after `this.getSessions` is called, and only when:
	// - `this.getSessions` returns nothing but `createIfNone` was `true` in call to `vscode.authentication.getSession`
	// - `vscode.authentication.getSession` was called with `forceNewSession: true` or
	//   `forceNewSession: {detail: "Reason message for modal dialog"}` (proposed API since 1.59, finalized in 1.63)
	// - The end user initiates the "silent" auth flow via the Accounts menu
	public async createSession(scopes: string[]): Promise<AuthenticationSession> {
		await this._ensureInitialized();
		const serverName = scopes[0] || await this.promptServerName();
		const spec = await getServerSpec(serverName);
		const userName = scopes[1] || spec?.auth.username || await this.promptUserName(serverName);
		// Return existing session if found
		const sessionId = ServerManagerAuthenticationProvider.sessionId(serverName, userName);
		const existingSession = await this.findExistingSession(sessionId);
		if (existingSession !== undefined) {
			return existingSession;
		}
		let auth: Authorization;
		if (spec?.auth.resolved()) {
			auth = spec.auth;
		} else {
			const credentialKey = ServerManagerAuthenticationProvider.credentialKey(sessionId);
			let accessToken = await this.secretStorage.get(credentialKey);
			if (accessToken === undefined) {
				if (spec?.auth instanceof OAuth2Authorization) {
					const tokenSet = await performOAuth2Login(sessionId, ServerManagerAuthenticationProvider.oauth2Config(spec));
					accessToken = tokenSet?.accessToken;
					if (accessToken) {
						await this.secretStorage.store(credentialKey, accessToken);
						await this._storeOAuth2Secret(sessionId, tokenSet);
						logger?.info(`OAuth2 [${sessionId}]: login complete, ${tokenSet?.refreshToken ? "refresh token stored" : "no refresh token"}`);
					}
				} else {
					// Password is "" if userName is ""
					accessToken = userName && await this.promptPassword(userName, serverName, credentialKey);
				}

			}
			auth = spec?.auth.clone() ?? new PasswordAuthorization();
			auth.resolve({ username: userName || "UnknownUser", accessToken });
		}
		if (auth.resolved()) {
			return this._finalizeSession(serverName, auth);
		} else {
			throw new Error("Internal error: Authorization should already be resolved");
		}
	}

	// This function is called when the end user signs out of the account.
	public async removeSession(sessionId: string): Promise<void> {
		await this._removeSession(sessionId);
	}

	public async removeSessions(sessionIds: string[]): Promise<void> {
		const storedPasswordCredKeys: string[] = [];
		const removed: AuthenticationSession[] = [];
		await Promise.allSettled(sessionIds.map(async (sessionId) => {
			const session = this._sessions.find((item) => item.id === sessionId);
			const credentialKey = ServerManagerAuthenticationProvider.credentialKey(sessionId);
			const isOAuth2 = await this._isOAuth2Session(sessionId, session);
			if (await this.secretStorage.get(credentialKey) !== undefined) {
				if (isOAuth2) {
					await this.secretStorage.delete(credentialKey);
				} else {
					storedPasswordCredKeys.push(credentialKey);
				}
			}
			// Always clear the private refresh token on sign-out
			await this.secretStorage.delete(ServerManagerAuthenticationProvider.oauth2SecretKey(sessionId));
			if (session) {
				removed.push(session);
			}
		}));
		// Remove from _sessions in a single pass; splicing by index inside the concurrent
		// loop above races, since each splice shifts the indexes the others captured.
		const removedIds = new Set(sessionIds);
		this._sessions = this._sessions.filter((s) => !removedIds.has(s.id));
		if (storedPasswordCredKeys.length) {
			const passwordOption = workspace.getConfiguration("intersystemsServerManager.credentialsProvider")
				.get<string>("deletePasswordOnSignout", "ask");
			let deletePasswords = (passwordOption === "always");
			if (passwordOption === "ask") {
				const choice = await window.showWarningMessage(
					`Do you want to keep the stored passwords or delete them?`,
					{
						detail: `${storedPasswordCredKeys.length == sessionIds.length ? "All" : "Some"
							} of the ${AUTHENTICATION_PROVIDER_LABEL} accounts you signed out are currently storing their passwords securely on your workstation.`, modal: true,
					},
					{ title: "Keep", isCloseAffordance: true },
					{ title: "Delete", isCloseAffordance: false },
				);
				deletePasswords = (choice?.title === "Delete");
			}
			if (deletePasswords) {
				await Promise.allSettled(storedPasswordCredKeys.map((e) => this.secretStorage.delete(e)));
			}
		}
		await this._storeStrippedSessions();
		this._onDidChangeSessions.fire({ added: [], removed, changed: [] });
	}

	private async promptServerName(): Promise<string> {
		if (!this._serverManagerExtension) {
			throw new Error(`InterSystems Server Manager extension is not available to provide server selection for ${AUTHENTICATION_PROVIDER_LABEL}.`);
		}
		if (!this._serverManagerExtension.isActive) {
			await this._serverManagerExtension.activate();
		}
		const serverName = await this._serverManagerExtension.exports.pickServer() ?? "";
		if (!serverName) {
			throw new Error(`${AUTHENTICATION_PROVIDER_LABEL}: Server name is required.`);
		}
		return serverName;
	}

	private async promptUserName(serverName: string): Promise<string> {
		// Prompt for the username.
		const enteredUserName = await window.showInputBox({
			ignoreFocusOut: true,
			placeHolder: `Username on server '${serverName}'`,
			prompt: "Enter the username to access the InterSystems server with. Leave blank for unauthenticated access as 'UnknownUser'.",
			title: `${AUTHENTICATION_PROVIDER_LABEL}: Username on InterSystems server '${serverName}'`,
		});
		if (enteredUserName === undefined) {
			throw new Error(`${AUTHENTICATION_PROVIDER_LABEL}: Username is required.`);
		}
		return enteredUserName;
	}

	private async findExistingSession(sessionId: string): Promise<AuthenticationSession | undefined> {
		const existingSession = this._sessions.find((s) => s.id === sessionId);
		if (existingSession) {
			if (this._checkedSessions.find((s) => s.id === sessionId)) {
				return existingSession;
			}

			// Check if the session is still valid
			if (await this._isStillValid(existingSession)) {
				this._checkedSessions.push(existingSession);
				return existingSession;
			}
		}
	}

	private async promptPassword(userName: string, serverName: string, credentialKey: string): Promise<string> {
		const doInputBox = async (): Promise<string | undefined> => {
			return await new Promise<string | undefined>((resolve, reject) => {
				const inputBox = window.createInputBox();
				inputBox.value = "";
				inputBox.password = true;
				inputBox.title = `${AUTHENTICATION_PROVIDER_LABEL}: Password for user '${userName}'`;
				inputBox.placeholder = `Password for user '${userName}' on '${serverName}'`;
				inputBox.prompt = "Optionally use $(key) button above to store password";
				inputBox.ignoreFocusOut = true;
				inputBox.buttons = [
					{
						iconPath: new ThemeIcon("key"),
						tooltip: "Store Password Securely in Workstation Keychain",
					},
				];

				async function done(secretStorage?: SecretStorage) {
					// Return the password, having stored it if storage was passed
					const enteredPassword = inputBox.value;
					if (secretStorage && enteredPassword) {
						await secretStorage.store(credentialKey, enteredPassword);
					}
					// Resolve the promise and tidy up
					resolve(enteredPassword);
					inputBox.dispose();
				}

				inputBox.onDidTriggerButton((_button) => {
					// We only added the one button, which stores the password
					done(this.secretStorage);
				});

				inputBox.onDidAccept(() => {
					// User pressed Enter
					done();
				});

				inputBox.onDidHide(() => {
					// User pressed Escape
					resolve(undefined);
					inputBox.dispose();
				});

				inputBox.show();
			});
		};
		const password = await doInputBox();
		if (!password) {
			throw new Error(`${AUTHENTICATION_PROVIDER_LABEL}: Password is required.`);
		}
		return password;
	}

	private async _finalizeSession(serverName: string, auth: ResolvedAuthorization): Promise<AuthenticationSession> {
		// We have all we need to create the session object
		const session = new ServerManagerAuthenticationSession(serverName, auth.username, auth.accessToken);
		// Update this._sessions and raise the event to notify
		const added: AuthenticationSession[] = [];
		const changed: AuthenticationSession[] = [];
		const index = this._sessions.findIndex((item) => item.id === session.id);
		if (index !== -1) {
			this._sessions[index] = session;
			changed.push(session);
		} else {
			// No point re-sorting here because onDidChangeSessions always appends added items to the provider's entries in the Accounts menu
			this._sessions.push(session);
			added.push(session);
		}
		await this._storeStrippedSessions();
		this._onDidChangeSessions.fire({ added, removed: [], changed });
		return session;
	}

	private async _isStillValid(session: ServerManagerAuthenticationSession): Promise<boolean> {
		if (this._checkedSessions.find((s) => s.id === session.id)) {
			return true;
		}
		const serverSpec = await getServerSpec(session.serverName);
		if (serverSpec) {
			const isOAuth2 = serverSpec.auth instanceof OAuth2Authorization;
			// Proactively renew an expired OAuth2 access token so we don't send a request we know will fail
			if (isOAuth2 && await this._isAccessTokenExpired(session.id)) {
				logger?.debug(`OAuth2 [${session.id}]: access token expired, refreshing proactively`);
				session = await this._tryRefresh(session, serverSpec) ?? session;
			}
			serverSpec.auth.resolve({ accessToken: session.accessToken, username: session.userName });
			const response = await makeRESTRequest("HEAD", serverSpec).catch(() => undefined);
			if (response?.status == 401) {
				// Before giving up and forcing an interactive login, try to renew via refresh token
				if (isOAuth2) { logger?.debug(`OAuth2 [${session.id}]: got 401, attempting refresh`); }
				const refreshed = isOAuth2 ? await this._tryRefresh(session, serverSpec) : undefined;
				if (!refreshed) {
					if (isOAuth2) { logger?.warn(`OAuth2 [${session.id}]: refresh unavailable, signing out (re-login required)`); }
					await this._removeSession(session.id, true);
					return false;
				}
				session = refreshed;
			}
			// Immediately log out the session created by credentials test
			await logout(session.serverName);
		}
		this._checkedSessions.push(session);
		return true;
	}

	/**
	 * Attempt to renew an OAuth2 access token using the privately-stored refresh token.
	 * On success the new access token is written to secret storage (which propagates to all
	 * windows) and the in-memory session is replaced. Concurrent callers share one refresh.
	 *
	 * @returns The refreshed session, or undefined if there is no refresh token or it is no longer valid.
	 */
	private async _tryRefresh(
		session: ServerManagerAuthenticationSession,
		serverSpec: IServerSpecWithAuth,
	): Promise<ServerManagerAuthenticationSession | undefined> {
		const existing = this._refreshInFlight.get(session.id);
		const promise = existing ?? this._doRefresh(session.id, serverSpec);
		if (!existing) {
			this._refreshInFlight.set(session.id, promise);
		}
		let accessToken: string | undefined;
		try {
			accessToken = await promise;
		} finally {
			if (!existing) {
				this._refreshInFlight.delete(session.id);
			}
		}
		if (!accessToken) { return undefined; }
		const index = this._sessions.findIndex((s) => s.id === session.id);
		const refreshed = new ServerManagerAuthenticationSession(session.serverName, session.userName, accessToken);
		if (index > -1) {
			this._sessions[index] = refreshed;
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [refreshed] });
		}
		return refreshed;
	}

	private async _doRefresh(sessionId: string, serverSpec: IServerSpecWithAuth): Promise<string | undefined> {
		const secret = await this._getOAuth2Secret(sessionId);
		if (!secret?.refreshToken) {
			logger?.debug(`OAuth2 [${sessionId}]: no refresh token stored`);
			return undefined;
		}
		const tokenSet = await refreshOAuth2Token(sessionId, ServerManagerAuthenticationProvider.oauth2Config(serverSpec), secret.refreshToken);
		if (!tokenSet) { return undefined; }
		const credentialKey = ServerManagerAuthenticationProvider.credentialKey(sessionId);
		await this.secretStorage.store(credentialKey, tokenSet.accessToken);
		await this._storeOAuth2Secret(sessionId, tokenSet);
		logger?.info(`OAuth2 [${sessionId}]: access token refreshed successfully`);
		return tokenSet.accessToken;
	}

	private async _isAccessTokenExpired(sessionId: string): Promise<boolean> {
		const secret = await this._getOAuth2Secret(sessionId);
		return secret?.expiresAt !== undefined && Date.now() >= secret.expiresAt;
	}

	// OAuth2 access tokens are not passwords: never prompt to "keep", always clear them.
	private async _isOAuth2Session(sessionId: string, session?: ServerManagerAuthenticationSession): Promise<boolean> {
		if (await this.secretStorage.get(ServerManagerAuthenticationProvider.oauth2SecretKey(sessionId)) !== undefined) { return true; }
		return session !== undefined && (await getServerSpec(session.serverName))?.auth instanceof OAuth2Authorization;
	}

	private async _getOAuth2Secret(sessionId: string): Promise<IOAuth2Secret | undefined> {
		const raw = await this.secretStorage.get(ServerManagerAuthenticationProvider.oauth2SecretKey(sessionId));
		if (!raw) { return undefined; }
		try {
			return JSON.parse(raw) as IOAuth2Secret;
		} catch {
			return undefined;
		}
	}

	private async _storeOAuth2Secret(sessionId: string, tokenSet?: IOAuth2Secret): Promise<void> {
		const key = ServerManagerAuthenticationProvider.oauth2SecretKey(sessionId);
		if (!tokenSet?.refreshToken) {
			// No refresh token issued (or none anymore): don't leave a stale one behind
			await this.secretStorage.delete(key);
			return;
		}
		await this.secretStorage.store(key, JSON.stringify({ refreshToken: tokenSet.refreshToken, expiresAt: tokenSet.expiresAt }));
	}

	private async _removeSession(sessionId: string, alwaysDeletePassword = false): Promise<void> {
		const index = this._sessions.findIndex((item) => item.id === sessionId);
		const session = this._sessions[index];

		const credentialKey = ServerManagerAuthenticationProvider.credentialKey(sessionId);
		const isOAuth2 = await this._isOAuth2Session(sessionId, session);
		let deletePassword = false;
		const hasStoredPassword = await this.secretStorage.get(credentialKey) !== undefined;
		if (alwaysDeletePassword || isOAuth2) {
			deletePassword = hasStoredPassword;
		} else {
			if (hasStoredPassword) {
				const passwordOption = workspace.getConfiguration("intersystemsServerManager.credentialsProvider")
					.get<string>("deletePasswordOnSignout", "ask");
				deletePassword = (passwordOption === "always");
				if (passwordOption === "ask") {
					const choice = await window.showWarningMessage(
						`Do you want to keep the password or delete it?`,
						{ detail: `The ${AUTHENTICATION_PROVIDER_LABEL} account you signed out (${session.account.label}) is currently storing its password securely on your workstation.`, modal: true },
						{ title: "Keep", isCloseAffordance: true },
						{ title: "Delete", isCloseAffordance: false },
					);
					deletePassword = (choice?.title === "Delete");
				}
			}
		}
		if (deletePassword) {
			// Delete from secret storage
			await this.secretStorage.delete(credentialKey);
		}
		// Always clear the private refresh token when the session goes away
		await this.secretStorage.delete(ServerManagerAuthenticationProvider.oauth2SecretKey(sessionId));
		if (index > -1) {
			// Remove session here so we don't store it
			this._sessions.splice(index, 1);
		}
		await this._storeStrippedSessions();
		this._onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
	}

	private async _ensureInitialized(): Promise<void> {
		if (this._initializedDisposable === undefined) {

			// Get the previously-persisted array of sessions that were stripped of their accessTokens (aka passwords)
			await this._reloadSessions();

			this._initializedDisposable = Disposable.from(
				// This onDidChange event happens when the secret storage changes in _any window_ since
				// secrets are shared across all open windows.
				this.secretStorage.onDidChange(async (e) => {
					for (const session of this._sessions) {
						const credentialKey = ServerManagerAuthenticationProvider.credentialKey(session.id);
						if (credentialKey === e.key) {
							const password = await this.secretStorage.get(credentialKey);

							// Only look up the session in _sessions after the await for password has completed,
							// in case _sessions has been changed elsewhere in the meantime
							const index = this._sessions.findIndex((sess) => sess.id === session.id);
							if (index > -1) {
								if (!password) {
									this._sessions.splice(index, 1);
								} else {
									this._sessions[index] = new ServerManagerAuthenticationSession(
										session.serverName,
										session.userName,
										password,
									);
								}
							}
						}
					}
				}),
				// This fires when the user initiates a "silent" auth flow via the Accounts menu.
				authentication.onDidChangeSessions(async (e) => {
					if (e.provider.id === ServerManagerAuthenticationProvider.id) {
						// TODO what, of anything?
					}
				}),
			);
		}
	}

	private async _reloadSessions() {
		const strippedSessions = globalState.get<StrippedSession[]>(
			"authenticationProvider.strippedSessions",
			[],
		);
		// Build our array of sessions for which non-empty accessTokens were securely persisted
		this._sessions = (await Promise.all(
			strippedSessions.map(async (session) => {
				const credentialKey = ServerManagerAuthenticationProvider.credentialKey(session.id);
				const accessToken = await this.secretStorage.get(credentialKey);
				if (accessToken === undefined) { return []; }
				return [new ServerManagerAuthenticationSession(session.serverName, session.userName, accessToken)];
			})))
			.flat(1)
			.sort((a, b) =>
				a.userName.toLowerCase().localeCompare(b.userName.toLowerCase())
				|| a.serverName.localeCompare(b.serverName));
	}

	private async _storeStrippedSessions() {
		// Persist an array of sessions with accessToken blanked
		await globalState.update(
			"authenticationProvider.strippedSessions",
			this._sessions.map((session): StrippedSession => {
				const { accessToken: _, ...strippedSession } = session;
				return strippedSession;
			}),
		);
	}
}
