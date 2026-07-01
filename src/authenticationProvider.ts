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
import { ServerManagerAuthenticationSession } from "./authenticationSession";
import { Authorization, globalState, OAuth2Authorization, PasswordAuthorization, ResolvedAuthorization } from "./commonActivate";
import { getServerSpec } from "./api/getServerSpec";
import { logout, makeRESTRequest } from "./makeRESTRequest";
import { performOAuth2Login } from "./oauth2Flow";
import { IServerSpec } from "@intersystems-community/intersystems-servermanager";

export const AUTHENTICATION_PROVIDER = "intersystems-server-credentials";
const AUTHENTICATION_PROVIDER_LABEL = "InterSystems Server Credentials";

interface StrippedSession {
	/** Session ID */
	id: string;
	serverName: string;
	userName: string;
}

export class ServerManagerAuthenticationProvider implements AuthenticationProvider, Disposable {
	public static id = AUTHENTICATION_PROVIDER;
	public static label = AUTHENTICATION_PROVIDER_LABEL;
	public static secretKeyPrefix = "credentialProvider:";
	public static sessionId(serverName: string, userName: string): string {
		const canonicalUserName = (userName || "").toLowerCase();
		return `${serverName}/${canonicalUserName}`;
	}
	public static credentialKey(sessionId: string): string {
		return `${ServerManagerAuthenticationProvider.secretKeyPrefix}${sessionId}`;
	}

	private _initializedDisposable: Disposable | undefined;

	private readonly _secretStorage;

	private _sessions: ServerManagerAuthenticationSession[] = [];
	private _checkedSessions: ServerManagerAuthenticationSession[] = [];

	private _serverManagerExtension = extensions.getExtension("intersystems-community.servermanager");

	private _onDidChangeSessions = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
	get onDidChangeSessions(): Event<AuthenticationProviderAuthenticationSessionsChangeEvent> {
		return this._onDidChangeSessions.event;
	}

	constructor(private readonly secretStorage: SecretStorage) {
		this._secretStorage = secretStorage;
	}

	public dispose(): void {

		this._initializedDisposable?.dispose();
	}

	// This function is called first when `vscode.authentication.getSession` is called.
	public async getSessions(scopes: readonly string[] = [], options: AuthenticationProviderSessionOptions): Promise<AuthenticationSession[]> {
		await this._ensureInitialized();
		let sessions = this._sessions;

		// Filter to return only those that match all supplied scopes, which are positional and case-insensitive.
		for (let index = 0; index < scopes.length; index++) {
			sessions = sessions.filter((session) => session.scopes[index]?.toLowerCase() === scopes[index]?.toLowerCase());
		}

		if (options.account) {
			const accountParts = options.account.id.split("/");
			const serverName = accountParts.shift();
			const userName = accountParts.join('/');
			if (serverName && userName) {
				sessions = sessions.filter((session) => session.scopes[0] === serverName && session.scopes[1]?.toLowerCase() === userName.toLowerCase());
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
		const spec = await getServerSpec(serverName)
		const userName = scopes[1] || spec?.username || await this.promptUserName(serverName);
		// Return existing session if found
		const sessionId = ServerManagerAuthenticationProvider.sessionId(serverName, userName);
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
		if (spec?.auth instanceof OAuth2Authorization) {
			const accessToken = await performOAuth2Login({
				authority: spec.auth.oauth2.authority,
				clientId: spec.auth.oauth2.clientId,
				audience: `${spec.webServer.scheme || "http"}://${spec.webServer.host}:${spec.webServer.port}/`
			});
			const auth: Authorization = new OAuth2Authorization(spec.auth.oauth2);
			if (auth.resolve({ accessToken: accessToken, username: "OAuth2User" })) {
				return this._finalizeSession(serverName, auth);
			} else {
				throw new Error(`${AUTHENTICATION_PROVIDER_LABEL}: OAuth2 login failed or was cancelled.`);
			};
		} else {
			const password = userName && await this.seekPassword(sessionId, userName, serverName);
			const auth: Authorization = new PasswordAuthorization(userName, password);
			if (auth.resolved()) {
				return this._finalizeSession(serverName, auth);
			} else {
				throw new Error("Internal error: username or password is invalid");
			};
		}
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

	private async seekPassword(sessionId: string, userName: string, serverName: string): Promise<string> {
		// Seek password in secret storage
		const credentialKey = ServerManagerAuthenticationProvider.credentialKey(sessionId);
		return await this.secretStorage.get(credentialKey) ?? await this.promptPassword(userName, serverName, credentialKey);
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

	private async _isStillValid(session: ServerManagerAuthenticationSession): Promise<boolean> {
		if (this._checkedSessions.find((s) => s.id === session.id)) {
			return true;
		}
		const serverSpec: IServerSpec | undefined = await getServerSpec(session.serverName);
		if (serverSpec) {
			const auth = serverSpec.auth;
			auth.resolve({ accessToken: session.accessToken })
			const response = await makeRESTRequest("HEAD", { ...serverSpec, auth }).catch(() => { /* Swallow errors */ });
			if (response?.status == 401) {
				await this._removeSession(session.id, true);
				return false;
			}
			// Immediately log out the session created by credentials test
			await logout(session.serverName);
		}
		this._checkedSessions.push(session);
		return true;
	}

	// This function is called when the end user signs out of the account.
	public async removeSession(sessionId: string): Promise<void> {
		this._removeSession(sessionId);
	}

	private async _removeSession(sessionId: string, alwaysDeletePassword = false): Promise<void> {
		const index = this._sessions.findIndex((item) => item.id === sessionId);
		const session = this._sessions[index];

		const credentialKey = ServerManagerAuthenticationProvider.credentialKey(sessionId);
		let deletePassword = false;
		const hasStoredPassword = await this.secretStorage.get(credentialKey) !== undefined;
		if (alwaysDeletePassword) {
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
		if (index > -1) {
			// Remove session here so we don't store it
			this._sessions.splice(index, 1);
		}
		await this._storeStrippedSessions();
		this._onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
	}

	public async removeSessions(sessionIds: string[]): Promise<void> {
		const storedPasswordCredKeys: string[] = [];
		const removed: AuthenticationSession[] = [];
		await Promise.allSettled(sessionIds.map(async (sessionId) => {
			const index = this._sessions.findIndex((item) => item.id === sessionId);
			const session = this._sessions[index];
			const credentialKey = ServerManagerAuthenticationProvider.credentialKey(sessionId);
			if (await this.secretStorage.get(credentialKey) !== undefined) {
				storedPasswordCredKeys.push(credentialKey);
			}
			if (index > -1) {
				this._sessions.splice(index, 1);
			}
			removed.push(session);
		}));
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
										password
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
		const maybeSessions = await Promise.all(
			strippedSessions.map(async (session) => {
				const credentialKey = ServerManagerAuthenticationProvider.credentialKey(session.id);
				const accessToken = await this._secretStorage.get(credentialKey);
				return new ServerManagerAuthenticationSession(session.serverName, session.userName, accessToken);
			})
		);
		const sessions = maybeSessions.filter((session) => session !== undefined) as ServerManagerAuthenticationSession[];
		this._sessions = sessions
			.sort((a, b) => {
				const aUserNameLowercase = (a.userName || "").toLowerCase();
				const bUserNameLowercase = (b.userName || "").toLowerCase();
				if (aUserNameLowercase < bUserNameLowercase) {
					return -1;
				}
				if (aUserNameLowercase > bUserNameLowercase) {
					return 1;
				}
				if (a.serverName < b.serverName) {
					return -1;
				}
				return 1;
			});
	}

	private async _storeStrippedSessions() {
		// Build an array of sessions with accessToken blanked
		await globalState.update(
			"authenticationProvider.strippedSessions",
			this._sessions.map((session): StrippedSession => {
				const { accessToken: _, ...strippedSession } = session;
				return strippedSession;
			}),
		);
	}
}
