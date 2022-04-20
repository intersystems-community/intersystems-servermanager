"use strict";

import * as vscode from "vscode";
import { addServer } from "./api/addServer";
import { BrowserTarget, getPortalUriWithToken } from "./api/getPortalUriWithToken";
import { getServerNames } from "./api/getServerNames";
import { getServerSpec } from "./api/getServerSpec";
import { getServerSummary } from "./api/getServerSummary";
import { pickServer } from "./api/pickServer";
import { AUTHENTICATION_PROVIDER, ServerManagerAuthenticationProvider } from "./authenticationProvider";
import { importFromRegistry } from "./commands/importFromRegistry";
import { clearPassword, storePassword } from "./commands/managePasswords";
import { cookieJar } from "./makeRESTRequest";
import { NamespaceTreeItem, ProjectTreeItem, ServerManagerView, ServerTreeItem, SMTreeItem } from "./ui/serverManagerView";

export const extensionId = "intersystems-community.servermanager";
export let globalState: vscode.Memento;

export interface IServerName {
    name: string;
    description: string;
    detail: string;
}

export interface IWebServerSpec {
    scheme?: string;
    host: string;
    port: number;
    pathPrefix?: string;
}

export interface IServerSpec {
    name: string;
    webServer: IWebServerSpec;
    username?: string;
    password?: string;
    description?: string;
}

export interface IJSONServerSpec {
    webServer: IWebServerSpec;
    username?: string;
    password?: string;
    description?: string;
}

export function activate(context: vscode.ExtensionContext) {

    const _onDidChangePassword = new vscode.EventEmitter<string>();

    // Other parts of this extension will use this to persist state
    globalState = context.globalState;

    // Register our authentication provider. NOTE: this will register the provider globally which means that
    // any other extension can request to use use this provider via the `vscode.authentication.getSession` API.
    context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(
        ServerManagerAuthenticationProvider.id,
        ServerManagerAuthenticationProvider.label,
        new ServerManagerAuthenticationProvider(context.secrets),
        {supportsMultipleAccounts: true},
    ));

    // Server Manager View
    const view = new ServerManagerView(context);

    // Ensure cookies do not survive an account sign-out
    // Undesirably indiscriminate - see https://github.com/microsoft/vscode/issues/137931
    context.subscriptions.push(
        vscode.authentication.onDidChangeSessions((e) => {
            if (e.provider.id === AUTHENTICATION_PROVIDER) {
                cookieJar.removeAllCookiesSync();
            }
        }),
    );

    // Register the commands
    context.subscriptions.push(
        vscode.commands.registerCommand("intersystems-community.servermanager-credentials.testLogin",
        async () => {
            // Get our session.
            const session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER, [], { createIfNone: true });
            vscode.window.showInformationMessage(`testLogin returned session ${JSON.stringify(session)}`);
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("intersystems-community.servermanager-credentials.testScopedLogin",
        async () => {
            // Get our session.
            const scopes = ["iris201", "johnm"];
            const session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER,
                scopes,
                { createIfNone: true },
            );
            vscode.window.showInformationMessage(`testScopedLogin with scopes ${JSON.stringify(scopes)} returned session ${JSON.stringify(session)}`);
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("intersystems-community.servermanager-credentials.testScopedLogin2",
        async () => {
            // Get our session.
            const scopes = ["iris201", "johnm2"];
            const session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER,
                scopes,
                { createIfNone: true },
            );
            vscode.window.showInformationMessage(`testScopedLogin2 with scopes ${JSON.stringify(scopes)} returned session ${JSON.stringify(session)}`);
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("intersystems-community.servermanager-credentials.testScopedLoginWithPreferenceCleared",
        async () => {
            // Get our session.
            const scopes = ["iris201", "johnm"];
            const session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER,
                scopes,
                { createIfNone: true, clearSessionPreference: true },
            );
            vscode.window.showInformationMessage(`testScopedLoginWithPreferenceCleared with scopes ${JSON.stringify(scopes)} returned session ${JSON.stringify(session)}`);
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("intersystems-community.servermanager-credentials.testScopedLogin2WithPreferenceCleared",
        async () => {
            // Get our session.
            const scopes = ["iris201", "johnm2"];
            const session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER,
                scopes,
                { createIfNone: true, clearSessionPreference: true },
            );
            vscode.window.showInformationMessage(`testScopedLogin2WithPreferenceCleared with scopes ${JSON.stringify(scopes)} returned session ${JSON.stringify(session)}`);
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("intersystems-community.servermanager-credentials.testPartiallyScopedLogin",
        async () => {
            // Get our session.
            const scopes = ["iris201"];
            const session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER,
                scopes,
                { createIfNone: true },
            );
            vscode.window.showInformationMessage(`testPartiallyScopedLogin with scopes ${JSON.stringify(scopes)} returned session ${JSON.stringify(session)}`);
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("intersystems-community.servermanager-credentials.testPartiallyScopedLoginWithPreferenceCleared",
        async () => {
            // Get our session.
            const scopes = ["iris201"];
            const session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER,
                scopes,
                { clearSessionPreference: true, createIfNone: true },
            );
            vscode.window.showInformationMessage(`testPartiallyScopedLoginWithPreferenceCleared with scopes ${JSON.stringify(scopes)} returned session ${JSON.stringify(session)}`);
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("intersystems-community.servermanager-credentials.testQuietLogin",
        async () => {
            // Get our session.
            const scopes = [];
            const session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER,
                scopes,
                { createIfNone: false },
            );
            vscode.window.showInformationMessage(`testQuietLogin with scopes ${JSON.stringify(scopes)} returned session ${JSON.stringify(session)}`);
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("intersystems-community.servermanager-credentials.testScopedQuietLogin",
        async () => {
            // Get our session.
            const scopes = ["iris201", "johnm"];
            const session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER,
                scopes,
                { createIfNone: false },
            );
            vscode.window.showInformationMessage(`testScopedQuietLogin with scopes ${JSON.stringify(scopes)} returned session ${JSON.stringify(session)}`);
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("intersystems-community.servermanager-credentials.testScopedQuietLogin2",
        async () => {
            // Get our session.
            const scopes = ["iris201", "johnm2"];
            const session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER,
                scopes,
                { createIfNone: false },
            );
            vscode.window.showInformationMessage(`testScopedQuietLogin2 with scopes ${JSON.stringify(scopes)} returned session ${JSON.stringify(session)}`);
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.refreshTree`, () => {
            view.refreshTree();
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.addServer`, async () => {
            const name = await addServer();
            if (name) {
                await view.addToRecents(name);
            }
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.addToStarred`, async (server?: ServerTreeItem) => {
            if (server?.contextValue?.match(/\.server\./) && server.name) {
                await view.addToFavorites(server.name);
            }
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.removeFromStarred`, async (server?: ServerTreeItem) => {
            if (server?.contextValue?.endsWith(".starred") && server.name) {
                await view.removeFromFavorites(server.name);
            }
        }),
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
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.openPortalTab`, (server?: ServerTreeItem) => {
            if (server?.contextValue?.match(/\.server\./) && server.name) {
                getPortalUriWithToken(BrowserTarget.SIMPLE, server.name).then((uriWithToken) => {
                    if (uriWithToken) {
                        //
                        // It is essential to pass skipEncoding=true when converting the uri to a string,
                        // otherwise the encoding done within Simple Browser / webview causes double-encoding
                        // of the querystring.
                        vscode.commands.executeCommand("simpleBrowser.show", uriWithToken.toString(true));
                    }
                });
            }
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.editSettings`, (server?: ServerTreeItem) => {
            // Until there's a dedicated settings editor the best we can do is jump to the right section
            vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${extensionId}`);
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.storePassword`, (server?: ServerTreeItem) => {
            storePassword(server)
                .then((name) => {
                    if (name && name.length > 0) {
                        _onDidChangePassword.fire(name);
                    }
                });
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.clearPassword`, (server?: ServerTreeItem) => {
            clearPassword(server)
            .then((name) => {
                if (name && name.length > 0) {
                    _onDidChangePassword.fire(name);
                }
            });
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.setIconRed`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, "red");
                view.refreshTree();
            }
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.setIconOrange`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, "orange");
                view.refreshTree();
            }
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.setIconYellow`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, "yellow");
                view.refreshTree();
            }
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.setIconGreen`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, "green");
                view.refreshTree();
            }
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.setIconBlue`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, "blue");
                view.refreshTree();
            }
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.setIconPurple`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, "purple");
                view.refreshTree();
            }
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.resetIconColor`, (server?: ServerTreeItem) => {
            if (server?.name) {
                view.setIconColor(server.name, undefined);
                view.refreshTree();
            }
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.importServers`, async () => {
            await importFromRegistry();
            view.refreshTree();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.retryServer`, (treeItem: SMTreeItem) => {
            const depth = treeItem.id?.split(":").length;
            if (depth === 2) {
                view.refreshTree(treeItem);
            } else if (depth === 3) {
                view.refreshTree(treeItem.parent);
            } else if (depth === 4) {
                view.refreshTree(treeItem.parent?.parent);
            }
        }),
    );

    const addWorkspaceFolderAsync = async (readonly: boolean, csp: boolean, namespaceTreeItem?: ServerTreeItem, project?: string) => {
        if (namespaceTreeItem) {
            const pathParts = namespaceTreeItem.id?.split(":");
            if (pathParts && pathParts.length === 4) {
                const serverName = pathParts[1];
                const namespace = pathParts[3];
                const serverSpec = await getServerSpec(serverName, undefined, undefined, true);
                if (serverSpec) {
                    const ISFS_ID = "intersystems-community.vscode-objectscript";
                    const isfsExtension = vscode.extensions.getExtension(ISFS_ID);
                    if (isfsExtension) {
                        if (!isfsExtension.isActive) {
                            await isfsExtension.activate();
                            if (!isfsExtension.isActive) {
                                vscode.window.showErrorMessage(`${ISFS_ID} could not be activated.`, "Close");
                                return;
                            }
                        }
                    } else {
                        vscode.window.showErrorMessage(`${ISFS_ID} is not installed.`, "Close");
                        return;
                    }

                    const params = [ csp ? "csp" : "", project ? `project=${project}` : ""].filter(e => e != "").join("&");
                    const uri = vscode.Uri.parse(`isfs${readonly ? "-readonly" : ""}://${serverName}:${namespace}/${params ? `?${params}` : ""}`);
                    if ((vscode.workspace.workspaceFolders || []).filter((workspaceFolder) => workspaceFolder.uri.toString() === uri.toString()).length === 0) {
                        const label = `${project ? `${project} - ` : ""}${serverName}:${namespace}${csp ? ' web files' : ''}${readonly && project == undefined ? " (read-only)" : ""}`;
                        const added = vscode.workspace.updateWorkspaceFolders(
                            vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
                            0,
                            { uri, name: label },
                        );
                        // Handle failure
                        if (added) {
                            await view.addToRecents(serverName);
                        } else {
                            vscode.window.showErrorMessage(`Folder ${uri.toString()} could not be added.`, "Close");
                        }
                    }
                    // Switch to Explorer view and focus on the folder
                    await vscode.commands.executeCommand("revealInExplorer", uri);
                }
            }
        }
    };

    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.editNamespace`,
        async (namespaceTreeItem?: ServerTreeItem) => {
            await addWorkspaceFolderAsync(false, false, namespaceTreeItem);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.viewNamespace`,
        async (namespaceTreeItem?: ServerTreeItem) => {
            await addWorkspaceFolderAsync(true, false, namespaceTreeItem);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.editNamespaceWebAppFiles`,
        async (namespaceTreeItem?: ServerTreeItem) => {
            await addWorkspaceFolderAsync(false, true, namespaceTreeItem);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(`${extensionId}.viewNamespaceWebAppFiles`,
        async (namespaceTreeItem?: ServerTreeItem) => {
            await addWorkspaceFolderAsync(true, true, namespaceTreeItem);
        }),
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
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("intersystems.servers") || e.affectsConfiguration("objectscript.conn")) {
            view.refreshTree();
        }
    }));

    // Expose our API
    const api = {
        async pickServer(
            scope?: vscode.ConfigurationScope,
            options: vscode.QuickPickOptions = {},
            ): Promise<string | undefined> {
            return await pickServer(scope, options);
        },

        getServerNames(
            scope?: vscode.ConfigurationScope,
            sorted?: boolean,
            ): IServerName[] {
            return getServerNames(scope, sorted);
        },

        getServerSummary(
            name: string,
            scope?: vscode.ConfigurationScope,
            ): IServerName | undefined {
            return getServerSummary(name, scope);
        },

        /**
         * Get specification for the named server.
         *
         * If the `"intersystemsServerManager.authentication.provider"` setting is "intersystems-server-credentials":
         *  - the returned object will not contain `password`. To get this:
         * ```
         *      const session = await vscode.authentication.getSession('intersystems-server-credentials', [serverSpec.name, serverSpec.username]);
         * ```
         *    The `accessToken` property of the returned [`AuthenticationSession`](https://code.visualstudio.com/api/references/vscode-api#AuthenticationSession) is the password.
         *  - `flushCredentialsCache` param will be ignored;
         *  - `noCredentials` property of `options` param has no effect;
         *
         * @param name Name of the server, used as the key into the 'intersystems.servers' settings object
         * @param scope Settings scope to look in.
         * @param flushCredentialCache If passed as true, flush extension's credential cache.
         * @param options
         * @returns { IServerSpec } Server specification object.
         */
        async getServerSpec(
            name: string,
            scope?: vscode.ConfigurationScope,
            flushCredentialCache: boolean = false,
            options?: { hideFromRecents?: boolean, noCredentials?: boolean },
            ): Promise<IServerSpec | undefined> {
            const spec = await getServerSpec(name, scope, flushCredentialCache, options?.noCredentials);
            if (spec && !options?.hideFromRecents) {
                await view.addToRecents(name);
            }
            return spec;
        },

        onDidChangePassword(
            ): vscode.Event<string> {
            return _onDidChangePassword.event;
        },

    };

    // 'export' public api-surface
    return api;
}

export function deactivate() {
    //
}
