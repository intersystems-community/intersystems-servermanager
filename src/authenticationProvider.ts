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
        userName: string,
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

	private _sessionChangeEmitter = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();

	// this property is used to determine if the token has been changed in another window of VS Code.
	// It is used in the checkForUpdates function.
	private _currentToken: Promise<string | undefined> | undefined;
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
			//void this._cacheTokenFromStorage();

			this._initializedDisposable = Disposable.from(
				// This onDidChange event happens when the secret storage changes in _any window_ since
				// secrets are shared across all open windows.
				this.secretStorage.onDidChange(e => {
					if (e.key.startsWith(ServerManagerAuthenticationProvider.secretKeyPrefix)) {
						void this._checkForUpdates();
					}
				}),
				// This fires when the user initiates a "silent" auth flow via the Accounts menu.
				authentication.onDidChangeSessions(e => {
					if (e.provider.id === ServerManagerAuthenticationProvider.id) {
						void this._checkForUpdates();
					}
				}),
			);
		}
	}

	// This is a crucial function that handles whether or not the token has changed in
	// a different window of VS Code and sends the necessary event if it has.
	private async _checkForUpdates(): Promise<void> {
		const added: AuthenticationSession[] = [];
		const removed: AuthenticationSession[] = [];
		const changed: AuthenticationSession[] = [];

		const previousToken = await this._currentToken;
		const session = (await this.getSessions())[0];

		if (session?.accessToken && !previousToken) {
			added.push(session);
		} else if (!session?.accessToken && previousToken) {
			removed.push(session);
		} else if (session?.accessToken !== previousToken) {
			changed.push(session);
		} else {
			return;
		}

		//void this._cacheTokenFromStorage();
		this._onDidChangeSessions.fire({ added: added, removed: removed, changed: changed });
	}

    /*
	private _cacheTokenFromStorage() {
		this._currentToken = this.secretStorage.get(ServerManagerAuthenticationProvider._secretKey) as Promise<string | undefined>;
		return this._currentToken;
	}
    */

	// This function is called first when `vscode.authentication.getSessions` is called.
	async getSessions(scopes: string[] = []): Promise<readonly AuthenticationSession[]> {
		this._ensureInitialized();
		//const token = await this._cacheTokenFromStorage();
		//return token ? [new ServerManagerAuthenticationSession(token)] : [];
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
            password = await window.showInputBox({
                ignoreFocusOut: true,
                placeHolder: `Password for ${userName} on ${serverName}`,
                prompt: `Enter the user's password.`,
                password: true,
            });
            
            if (!password) {
                throw new Error('Password is required');
            }

        	/*  //TODO store password
            await this.secretStorage.store(credentialKey, password);
			*/
            console.log(`TODO: Store password at ${credentialKey}`);
		}

		const session = new ServerManagerAuthenticationSession(serverName, userName, password);

		// Remove previous session with this id, which may exist if clearSessionPreference was set on the getSession call
		this._sessions = this._sessions.filter((sess) => sess.id !== session.id );

		// Store the new session and return it
		this._sessions.push(session);

		// Raise the event
		this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });

		return session;
	}

	// This function is called when the end user signs out of the account.
	async removeSession(sessionId: string): Promise<void> {
        const credentialKey = ServerManagerAuthenticationProvider.credentialKey(sessionId);
		await this.secretStorage.delete(credentialKey);
		this._sessions = this._sessions.filter((session) => {session.id !== sessionId} );
	}
}
