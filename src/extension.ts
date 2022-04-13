'use strict';
export const extensionId = 'intersystems-community.servermanager';

import * as vscode from 'vscode';
import { pickServer } from './api/pickServer';
import { getServerNames } from './api/getServerNames';
import { getServerSpec } from './api/getServerSpec';
import { storePassword, clearPassword } from './commands/managePasswords';
import { importFromRegistry } from './commands/importFromRegistry';
import { NamespaceTreeItem, ProjectTreeItem, ServerManagerView, ServerTreeItem, SMTreeItem } from './ui/serverManagerView';
import { addServer } from './api/addServer';
import { getServerSummary } from './api/getServerSummary';
import { BrowserTarget, getPortalUriWithToken } from './api/getPortalUriWithToken';

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
            const name = await addServer();
            if (name) {
                await view.addToRecents(name);
            }
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
		vscode.commands.registerCommand(`${extensionId}.openPortalExternal`, (server?: ServerTreeItem) => {
            if (server?.contextValue?.match(/\.server\./) && server.name) {
                getPortalUriWithToken(BrowserTarget.EXTERNAL, server.name).then((uriWithToken) => {
                    if (uriWithToken) {
                        vscode.env.openExternal(uriWithToken);
                    }
                });
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.openPortalTab`, (server?: ServerTreeItem) => {
            if (server?.contextValue?.match(/\.server\./) && server.name) {
                getPortalUriWithToken(BrowserTarget.SIMPLE, server.name).then((uriWithToken) => {
                    if (uriWithToken) {
                        //
                        // It is essential to pass skipEncoding=true when converting the uri to a string,
                        // otherwise the encoding done within Simple Browser / webview causes double-encoding of the querystring.
                        vscode.commands.executeCommand('simpleBrowser.show', uriWithToken.toString(true));
                    }
                });
            }
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.editSettings`, (server?: ServerTreeItem) => {
            // Until there's a dedicated settings editor the best we can do is jump to the right section
            vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${extensionId}`);
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

    context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.retryServer`, (treeItem: SMTreeItem) => {
            const depth = treeItem.id?.split(':').length;
            if (depth === 2) {
                view.refreshTree(treeItem);
            }
            else if (depth === 3) {
                view.refreshTree(treeItem.parent);
            }
            else if (depth === 4) {
                view.refreshTree(treeItem.parent?.parent);
            }
        })
    );

    const addWorkspaceFolderAsync = async (readonly: boolean, csp: boolean, namespaceTreeItem?: ServerTreeItem, project?: string) => {
        if (namespaceTreeItem) {
            const pathParts = namespaceTreeItem.id?.split(':');
            if (pathParts && pathParts.length === 4) {
                const serverName = pathParts[1];
                const namespace = pathParts[3];
                const serverSpec = await getServerSpec(serverName, undefined, undefined, true);
                if (serverSpec) {
                    const ISFS_ID = 'intersystems-community.vscode-objectscript';
                    const isfsExtension = vscode.extensions.getExtension(ISFS_ID);
                    if (isfsExtension) {
                        if (!isfsExtension.isActive) {
                            await isfsExtension.activate();
                            if (!isfsExtension.isActive) {
                                vscode.window.showErrorMessage(`${ISFS_ID} could not be activated.`, "Close")
                                return;
                            }
                        }
                    }
                    else {
                        vscode.window.showErrorMessage(`${ISFS_ID} is not installed.`, "Close")
                        return;
                    }

                    const params = [ csp ? "csp" : "", project ? `project=${project}` : ""].filter(e => e != "").join("&");
                    const uri = vscode.Uri.parse(`isfs${readonly ? "-readonly" : ""}://${serverName}:${namespace}/${params ? `?${params}` : ""}`);
                    if ((vscode.workspace.workspaceFolders || []).filter((workspaceFolder) => workspaceFolder.uri.toString() === uri.toString()).length === 0) {                       
                        const label = `${project ? `${project} - ` : ""}${serverName}:${namespace}${csp ? ' web files' : ''}${readonly && project == undefined ? " (read-only)" : ""}`;
                        const added = vscode.workspace.updateWorkspaceFolders(
                            vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
                            0,
                            { uri, name: label }
                        );
                        // Handle failure
                        if (added) {
                            await view.addToRecents(serverName);
                        }
                        else {
                            vscode.window.showErrorMessage(`Folder ${uri.toString()} could not be added.`, "Close")
                        }
                    }
                    // Switch to Explorer view and focus on the folder
                    await vscode.commands.executeCommand("revealInExplorer", uri);
                }
            }
        }
    }
    
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.editNamespace`, async (namespaceTreeItem?: ServerTreeItem) => {await addWorkspaceFolderAsync(false, false, namespaceTreeItem)})
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.viewNamespace`, async (namespaceTreeItem?: ServerTreeItem) => {await addWorkspaceFolderAsync(true, false, namespaceTreeItem)})
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.editNamespaceWebAppFiles`, async (namespaceTreeItem?: ServerTreeItem) => {await addWorkspaceFolderAsync(false, true, namespaceTreeItem)})
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.viewNamespaceWebAppFiles`, async (namespaceTreeItem?: ServerTreeItem) => {await addWorkspaceFolderAsync(true, true, namespaceTreeItem)})
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.editProject`, async (projectTreeItem?: ProjectTreeItem) => {
            await addWorkspaceFolderAsync(false, false, <NamespaceTreeItem>projectTreeItem?.parent?.parent, projectTreeItem?.name);
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.viewProject`, async (projectTreeItem?: ProjectTreeItem) => {
            await addWorkspaceFolderAsync(true, false, <NamespaceTreeItem>projectTreeItem?.parent?.parent, projectTreeItem?.name);
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
        
        getServerNames(scope?: vscode.ConfigurationScope, sorted?: boolean): ServerName[] {
            return getServerNames(scope, sorted);
        },

        getServerSummary(name: string, scope?: vscode.ConfigurationScope): ServerName | undefined {
            return getServerSummary(name, scope);
        },

        async getServerSpec(name: string, scope?: vscode.ConfigurationScope, flushCredentialCache: boolean = false, options?: { hideFromRecents?: boolean, noCredentials?: boolean}): Promise<ServerSpec | undefined> {
            const spec = await getServerSpec(name, scope, flushCredentialCache, options?.noCredentials);
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
