import {
	authentication,
	AuthenticationProvider,
	AuthenticationProviderAuthenticationSessionsChangeEvent,
	AuthenticationSession,
	AuthenticationSessionAccountInformation,
	Disposable,
	Event,
	EventEmitter,
	SecretStorage,
	ThemeIcon,
	window,
} from 'vscode';
import { pickServer } from './api/pickServer';

class ServerManagerAuthenticationSession implements AuthenticationSession {
    public readonly id: string;
    public readonly accessToken: string;
    public readonly account: AuthenticationSessionAccountInformation;
    public readonly scopes: string[];
	constructor(
        public readonly serverName: string,
        public readonly userName: string,
        password: string
        ) {
        this.id = ServerManagerAuthenticationProvider.sessionId(serverName, userName);
        this.accessToken = password;
        this.account = {id: userName, label: `${userName} on ${serverName}`};
		this.scopes = [serverName, userName];
    }
}

export class ServerManagerAuthenticationProvider implements AuthenticationProvider, Disposable {
	static id = 'intersystems-servermanager';
	static label = 'InterSystems Server Manager';
    static secretKeyPrefix = 'authenticationProvider:';
	static sessionId(serverName: string, userName: string): string {
        return `${serverName}@${userName}`;
    }
	static credentialKey(sessionId: string): string {
        return `${ServerManagerAuthenticationProvider.secretKeyPrefix}${sessionId}`;
    }

	private _initializedDisposable: Disposable | undefined;

	private _sessions: ServerManagerAuthenticationSession[] = [];

	private _onDidChangeSessions = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
	get onDidChangeSessions(): Event<AuthenticationProviderAuthenticationSessionsChangeEvent> {
		return this._onDidChangeSessions.event;
	}

	constructor(private readonly secretStorage: SecretStorage) { }

	dispose(): void {
		this._initializedDisposable?.dispose();
	}

	private _ensureInitialized(): void {
		if (this._initializedDisposable === undefined) {

			this._initializedDisposable = Disposable.from(
				// This onDidChange event happens when the secret storage changes in _any window_ since
				// secrets are shared across all open windows.
				this.secretStorage.onDidChange(e => {
					this._sessions.forEach(
						async (session, index) => {
							const credentialKey = ServerManagerAuthenticationProvider.credentialKey(session.id);
							if (credentialKey === e.key) {
								const password = await this.secretStorage.get(credentialKey);
								if (!password) {
									this._sessions.splice(index, 1);
								}
								else {
									this._sessions[index] = new ServerManagerAuthenticationSession(session.serverName, session.userName, password);
								}
							}
						},
						this
					);
				}),
				// This fires when the user initiates a "silent" auth flow via the Accounts menu.
				authentication.onDidChangeSessions(e => {
					if (e.provider.id === ServerManagerAuthenticationProvider.id) {
						//void this._checkForUpdates();
					}
				}),
			);
		}
	}

	// This function is called first when `vscode.authentication.getSessions` is called.
	async getSessions(scopes: string[] = []): Promise<readonly AuthenticationSession[]> {
		this._ensureInitialized();
		let sessions = this._sessions;

		// Filter to return only those that match all supplied scopes, which are positional.
		for (let index = 0; index < scopes.length; index++) {
			sessions = sessions.filter((session) => session.scopes[index] === scopes[index]);
		}
		return sessions;
	}

	// This function is called after `this.getSessions` is called, and only when:
	// - `this.getSessions` returns nothing but `createIfNone` was set to `true` in `vscode.authentication.getSession`
	// - `vscode.authentication.getSession` was called with `forceNewSession: true` or `forceNewSession: "Reason message for modal dialog"` (proposed API since 1.59, finalized in 1.63)
	// - The end user initiates the "silent" auth flow via the Accounts menu
	async createSession(scopes: string[]): Promise<AuthenticationSession> {
		this._ensureInitialized();

        let serverName = scopes[0] ?? '';
        if (!serverName) {
            // Prompt for the server name.
            serverName = await pickServer() ?? '';
            if (!serverName) {
                throw new Error('Server name is required');
            }
        }

        let userName = scopes[1] ?? '';
        if (!userName) {
            // Prompt for the username.
            userName = await window.showInputBox({
                ignoreFocusOut: true,
                placeHolder: `Username on server '${serverName}'`,
                prompt: 'Enter the username with which to access the InterSystems server.',
            }) ?? '';
            if (!userName) {
                throw new Error('Username is required');
            }
        }
        const credentialKey = ServerManagerAuthenticationProvider.credentialKey(ServerManagerAuthenticationProvider.sessionId(serverName, userName));

        let password = await this.secretStorage.get(credentialKey);

        if (!password) {
            // Prompt for the password.
            const doInputBox = async (): Promise<string | undefined> => {
                return await new Promise<string | undefined>((resolve, reject) => {
                    const inputBox = window.createInputBox();
                    inputBox.password = true,
                    inputBox.title = `Password for InterSystems server '${serverName}'`,
                    inputBox.placeholder = `Password for user '${userName}' on '${serverName}'`,
                    inputBox.prompt = 'To store your password securely, submit it using the $(key) button',
                    inputBox.ignoreFocusOut = true,
                    inputBox.buttons = [{ iconPath: new ThemeIcon('key'), tooltip: 'Store Password in Keychain' }]

                    async function done(secretStorage?: SecretStorage) {
                        // File the password and return it
						const password = inputBox.value;
                        if (secretStorage && password) {
							await secretStorage.store(credentialKey, password);
							console.log(`Stored password at ${credentialKey}`);
                        }
                        // Resolve the promise and tidy up
                        resolve(password);
                        inputBox.hide();
                        inputBox.dispose();
                    }

                    inputBox.onDidTriggerButton((_button) => {
                        // We only added one button  
                        done(this.secretStorage);
                    });
                    inputBox.onDidAccept(() => {
                        done();
                    });
                    inputBox.show();
                })
            };
            password = await doInputBox();
            if (!password) {
                throw new Error('Password is required');
            }
		}

		// We have all we need to create the session object
		const session = new ServerManagerAuthenticationSession(serverName, userName, password);
		
		// Update this._sessions and raise the event to notify
		const added: AuthenticationSession[] = [];
		const changed: AuthenticationSession[] = [];
		const index = this._sessions.findIndex((item) => item.id === session.id)
		if (index !== -1) {
			this._sessions[index] = session;
			changed.push(session);
		}
		else {
			this._sessions.push(session);
			added.push(session);
		}
		this._onDidChangeSessions.fire({ added, removed: [], changed });
		
		return session;
	}
	
	// This function is called when the end user signs out of the account.
	async removeSession(sessionId: string): Promise<void> {
		const index = this._sessions.findIndex((item) => item.id === sessionId);
		const session = this._sessions[index];

		const credentialKey = ServerManagerAuthenticationProvider.credentialKey(sessionId);
		if (await this.secretStorage.get(credentialKey)) {
			// Delete from secret storage, which will trigger an event that we will use to remove the session
			await this.secretStorage.delete(credentialKey);
			console.log(`Deleted password at ${credentialKey}`);
		}
		else if (index > -1) {
			// Password wasn't stored, so remove session here
			this._sessions.splice(index, 1);
		}
		this._onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
	}
}
