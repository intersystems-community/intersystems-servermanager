'use strict';
export const extensionId = 'intersystems-community.servermanager';

import * as vscode from 'vscode';
import { pickServer } from './api/pickServer';
import { getServerNames } from './api/getServerNames';
import { getServerSpec } from './api/getServerSpec';
import { storePassword, clearPassword } from './commands/managePasswords';
import { importFromRegistry } from './commands/importFromRegistry';
import { ServerManagerView, ServerTreeItem } from './ui/serverManagerView';
import { addServer } from './api/addServer';
import { getPortalUriWithCredentials } from './api/getPortalUriWithCredentials';
import { getServerSummary } from './api/getServerSummary';

export interface ServerName {
    name: string,
    description: string,
    detail: string
}

export interface WebServerSpec {
    scheme?: string,
    host: string,
    port: number,
    pathPrefix?: string
}

export interface ServerSpec {
    name: string,
    webServer: WebServerSpec,
    username?: string,
    password?: string,
    description?: string
}

export interface JSONServerSpec {
    webServer: WebServerSpec,
    username?: string,
    password?: string,
    description?: string
}

export function activate(context: vscode.ExtensionContext) {

    const _onDidChangePassword = new vscode.EventEmitter<string>();

	// Server Manager View
	const view = new ServerManagerView(context);

    // Register the commands
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.refreshTree`, () => {
            view.refreshTree();
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.addServer`, async () => {
            await addServer();
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.addToStarred`, async (server?: ServerTreeItem) => {
            if (server?.contextValue?.match(/\.server\./) && server.name) {
                await view.addToFavorites(server.name);
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.removeFromStarred`, async (server?: ServerTreeItem) => {
            if (server?.contextValue?.endsWith('.starred') && server.name) {
                await view.removeFromFavorites(server.name);
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.openManagementPortalExternal`, (server?: ServerTreeItem) => {
            if (server?.contextValue?.match(/\.server\./) && server.name) {
                getPortalUriWithCredentials(server.name).then((uriWithCredentials) => {
                    if (uriWithCredentials) {
                        vscode.env.openExternal(uriWithCredentials);
                    }
                });
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.openManagementPortalInSimpleBrowser`, (server?: ServerTreeItem) => {
            if (server?.contextValue?.match(/\.server\./) && server.name) {
                getPortalUriWithCredentials(server.name).then((uriWithCredentials) => {
                    if (uriWithCredentials) {
                        //vscode.commands.executeCommand('simpleBrowser.api.open', uriWithCredentials);
                        //
                        // It is essential to pass skipEncoding=true when converting the uri to a string,
                        // otherwise the encoding done within Simple Browser / webview causes double-encoding of the querystring.
                        vscode.commands.executeCommand('simpleBrowser.show', uriWithCredentials.toString(true));
                    }
                });
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.storePassword`, (server?: ServerTreeItem) => {
            storePassword(server)
                .then((name) => {
                    if (name && name.length > 0) {
                        _onDidChangePassword.fire(name);
                    }
                });
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.clearPassword`, (server?: ServerTreeItem) => {
            clearPassword(server)
            .then((name) => {
                if (name && name.length > 0) {
                    _onDidChangePassword.fire(name);
                }
            });
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.setIconRed`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, 'red');
                view.refreshTree();
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.setIconOrange`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, 'orange');
                view.refreshTree();
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.setIconYellow`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, 'yellow');
                view.refreshTree();
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.setIconGreen`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, 'green');
                view.refreshTree();
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.setIconBlue`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, 'blue');
                view.refreshTree();
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.setIconPurple`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, 'purple');
                view.refreshTree();
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.resetIconColor`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, undefined);
                view.refreshTree();
            }
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.importServers`, async () => {
            await importFromRegistry();
            view.refreshTree();
        })
    );

    // Listen for relevant configuration changes
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('intersystems.servers') || e.affectsConfiguration('objectscript.conn')) {
            view.refreshTree();
        }
    }));

    // Expose our API
    let api = {
        async pickServer(scope?: vscode.ConfigurationScope, options: vscode.QuickPickOptions = {}): Promise<string | undefined> {
            return await pickServer(scope, options);
        },
        getServerNames(scope?: vscode.ConfigurationScope): ServerName[] {
            return getServerNames(scope);
        },

        getServerSummary(name: string, scope?: vscode.ConfigurationScope): ServerName | undefined {
            return getServerSummary(name, scope);
        },

        async getServerSpec(name: string, scope?: vscode.ConfigurationScope, flushCredentialCache: boolean = false, options?: { hideFromRecents?: boolean}): Promise<ServerSpec | undefined> {
            const spec = await getServerSpec(name, scope, flushCredentialCache);
            if (spec && !options?.hideFromRecents) {
                await view.addToRecents(name);
            }
            return spec;
        },

        onDidChangePassword(): vscode.Event<string> {
            return _onDidChangePassword.event;
        }

    };

    // 'export' public api-surface
    return api;
}

export function deactivate() {
}
