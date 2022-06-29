import * as vscode from 'vscode';
import { filePassword } from '../commands/managePasswords';
import { ServerSpec } from '../extension';
import { Keychain } from '../keychain';

interface CredentialSet {
    username: string,
    password: string
}

export let credentialCache = new Map<string, CredentialSet>();

/**
 * Get a server specification.
 * 
 * @param name The name.
 * @param scope The settings scope to use for the lookup.
 * @param flushCredentialCache Flush the session's cache of credentials obtained from keystore and/or user prompting.
 * @param noCredentials Set username and password as undefined; do not fetch credentials from anywhere.
 * @returns Server specification or undefined.
 */
export async function getServerSpec(name: string, scope?: vscode.ConfigurationScope, flushCredentialCache: boolean = false, noCredentials: boolean = false): Promise<ServerSpec | undefined> {
    if (flushCredentialCache) {
        credentialCache[name] = undefined;
    }
    let server: ServerSpec | undefined = vscode.workspace.getConfiguration('intersystems.servers', scope).get(name);

    // Unknown server
    if (!server) {
        return undefined;
    }

    server.name = name;
    server.description = server.description || '';
    server.webServer.scheme = server.webServer.scheme || 'http';
    server.webServer.port = server.webServer.port || (server.webServer.scheme === 'https' ? 443 : 80);
    server.webServer.pathPrefix = server.webServer.pathPrefix || '';

    if (noCredentials) {
        server.username = undefined;
        server.password = undefined;
    }
    else {

        // Use cached username if appropriate
        if (!server.username && credentialCache[name]) {
          server.username = credentialCache[name].username;
        }

        // Prompt for a username if necessary (including blank to try connecting anonymously)
        if (!server.username) {
            await vscode.window
            .showInputBox({
                placeHolder: `Username to connect to InterSystems server '${name}' as`,
                prompt: 'Leave empty to attempt unauthenticated access',
                ignoreFocusOut: true,
            })
            .then((username) => {
                if (username && server) {
                    server.username = username;
                } else {
                    return undefined;
                }
            });
            if (!server.username) {
                server.username = '';
                server.password = '';
            }
        }
        
        // Obtain password from session cache or keychain unless trying to connect anonymously
        if (server.username && !server.password) {
            if (credentialCache[name] && credentialCache[name].username === server.username) {
                server.password = credentialCache[name].password;
            } else {
                const keychain = new Keychain(name);
                const password = await keychain.getPassword().then(result => {
                    if (typeof result === 'string') {
                        return result;
                    } else {
                        return undefined;
                    }
                });
                if (password) {
                    server.password = password;
                    credentialCache[name] = {username: server.username, password: password};
                }
            }
            
        }
        if (server.username && !server.password) {
            const doInputBox = async (): Promise<string | undefined> => {
                return await new Promise<string | undefined>((resolve, reject) => {
                    const inputBox = vscode.window.createInputBox();
                    inputBox.password = true,
                    inputBox.title = `Password for InterSystems server '${name}'`,
                    inputBox.placeholder = `Password for user '${server?.username}' on '${name}'`,
                    inputBox.prompt = 'To store your password securely, submit it using the $(key) button',
                    inputBox.ignoreFocusOut = true,
                    inputBox.buttons = [{ iconPath: new vscode.ThemeIcon('key'), tooltip: 'Store Password in Keychain' }]

                    async function done(store: boolean) {
                        // File the password and return it
                        if (store) {
                            await filePassword(name, inputBox.value)
                        }
                        // Resolve the promise and tidy up
                        resolve(inputBox.value);
                        inputBox.hide();
                        inputBox.dispose();
                    }

                    inputBox.onDidTriggerButton((button) => {
                        // We only added one button  
                        done(true);
                    });
                    inputBox.onDidAccept(() => {
                        done(false);
                    });
                    inputBox.show();
                })
            };
            await doInputBox().then((password) => {
                if (password && server) {
                    server.password = password;
                    credentialCache[name] = {username: server.username, password: password};
                } else {
                    server = undefined;
                }
            })
        }
    }
    return server;
}
