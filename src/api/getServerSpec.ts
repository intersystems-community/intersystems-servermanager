import * as vscode from 'vscode';
import { ServerSpec } from '../extension';
import { Keychain } from '../keychain';

interface CredentialSet {
    username: string,
    password: string
}

export let credentialCache = new Map<string, CredentialSet>();

export async function getServerSpec(name: string, scope?: vscode.ConfigurationScope, flushCredentialCache: boolean = false): Promise<ServerSpec | undefined> {
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
    server.webServer.pathPrefix = server.webServer.pathPrefix || '';

    // Obtain a username (including blank to try connecting anonymously)
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
        await vscode.window
            .showInputBox({
                password: true,
                placeHolder: `Password for user '${server.username}' on InterSystems server '${name}'`,
                validateInput: (value => {
                    return value.length > 0 ? '' : 'Mandatory field';
                }),
                ignoreFocusOut: true,
            })
            .then((password) => {
                if (password && server) {
                    server.password = password;
                    credentialCache[name] = {username: server.username, password: password};
                } else {
                    server = undefined;
                }
            })
    }
    return server;
}
