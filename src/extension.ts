"use strict";

import * as vscode from "vscode";
import { IServerName, IServerSpec } from "@intersystems-community/intersystems-servermanager";
import { addServer } from "./api/addServer";
import { BrowserTarget, getPortalUriWithToken } from "./api/getPortalUriWithToken";
import { getServerNames } from "./api/getServerNames";
import { getServerSpec } from "./api/getServerSpec";
import { getServerSummary } from "./api/getServerSummary";
import { pickServer } from "./api/pickServer";
import { AUTHENTICATION_PROVIDER, ServerManagerAuthenticationProvider } from "./authenticationProvider";
import { importFromRegistry } from "./commands/importFromRegistry";
import { logout, serverSessions } from "./makeRESTRequest";
import { NamespaceTreeItem, ProjectTreeItem, ServerManagerView, ServerTreeItem, SMTreeItem, WebAppTreeItem } from "./ui/serverManagerView";

export const extensionId = "intersystems-community.servermanager";
export const OBJECTSCRIPT_EXTENSIONID = "intersystems-community.vscode-objectscript";

export let globalState: vscode.Memento;

export function getAccountFromParts(serverName: string, userName?: string): vscode.AuthenticationSessionAccountInformation | undefined {
	const accountId = userName ? `${serverName}/${userName.toLowerCase()}` : undefined;
	return accountId ? { id: accountId, label: `${userName} on ${serverName}` } : undefined;
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
		{ supportsMultipleAccounts: true },
	));

	// Server Manager View
	const view = new ServerManagerView(context);

	// Ensure cookies do not survive an account sign-out
	context.subscriptions.push(
		vscode.authentication.onDidChangeSessions((e) => {
			if (e.provider.id === AUTHENTICATION_PROVIDER) {
				serverSessions.forEach(async (serverSession) => {

					// Still logged in with the authentication provider?
					const scopes = [serverSession.serverName, serverSession.username.toLowerCase()];
					const account = getAccountFromParts(serverSession.serverName, serverSession.username);
					const session = await vscode.authentication.getSession(
						AUTHENTICATION_PROVIDER,
						scopes,
						{ silent: true, account },
					);

					// If not, try to log out on the server, then remove our record of its cookies
					if (!session) {
						await logout(serverSession.serverName);
						serverSession.cookies = [];
					}
				});
			}
		}),
	);

	// Register the commands
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
		vscode.commands.registerCommand(`${extensionId}.removeFromRecent`, async (server?: ServerTreeItem) => {
			if (server?.name) {
				await view.removeFromRecents(server.name);
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
						// otherwise the querystring's & and = get encoded.
						vscode.commands.executeCommand("simpleBrowser.show", uriWithToken.toString(true));
					}
				});
			}
		}),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.openPortalExplorerExternal`, (namespaceTreeItem?: NamespaceTreeItem) => {
			if (namespaceTreeItem) {
				const pathParts = namespaceTreeItem.id?.split(":");
				if (pathParts && pathParts.length === 4) {
					const serverName = pathParts[1];
					const namespace = pathParts[3];
					getPortalUriWithToken(BrowserTarget.EXTERNAL, serverName, "/csp/sys/exp/%25CSP.UI.Portal.ClassList.zen", namespace).then((uriWithToken) => {
						if (uriWithToken) {
							vscode.env.openExternal(uriWithToken);
						}
					});
				}
			}
		}),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.editSettings`, (server?: ServerTreeItem) => {
			// Attempt to open the correct JSON file
			server = server instanceof ServerTreeItem ? server : undefined;
			const servers = vscode.workspace.getConfiguration("intersystems").inspect<{ [key: string]: any }>("servers");
			const openJSONArg = { revealSetting: { key: "intersystems.servers" } };
			const revealServer = (): void => {
				// Find the start of the server's settings block
				const editor = vscode.window.activeTextEditor;
				const regex = new RegExp(`"${server?.name}"\\s*:`);
				if (editor && (editor.document.uri.path.endsWith("/settings.json") || editor.document.uri.path.endsWith(".code-workspace"))) {
					// The cursor is currently at "|intersystems.servers", so start our scan from there
					for (let i = editor.selection.start.line; i < editor.document.lineCount; i++) {
						const line = editor.document.lineAt(i).text;
						const match = regex.exec(line);
						const commentStart = line.indexOf("//");
						if (match && (commentStart == -1 || match.index < commentStart)) {
							const cursorPos = new vscode.Position(i, match.index + 1);
							editor.revealRange(new vscode.Range(cursorPos, cursorPos), vscode.TextEditorRevealType.InCenter);
							editor.selection = new vscode.Selection(cursorPos, cursorPos);
							break;
						}
					}
				}
			};
			if (server && servers?.workspaceValue?.hasOwnProperty(server.name)) {
				// Open the workspace settings file
				vscode.commands.executeCommand("workbench.action.openWorkspaceSettingsFile", openJSONArg).then(revealServer);
			} else if (server && servers?.globalValue?.hasOwnProperty(server.name)) {
				// Open the user settings.json
				vscode.commands.executeCommand("workbench.action.openSettingsJson", openJSONArg).then(revealServer);
			} else {
				// Just show the UI
				vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${extensionId}`);
			}
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
			await importFromRegistry(context.secrets);
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

	const addWorkspaceFolderAsync = async (readonly: boolean, csp: boolean, namespaceTreeItem?: ServerTreeItem, project?: string, webApp?: string) => {
		if (namespaceTreeItem) {
			const pathParts = namespaceTreeItem.id?.split(":");
			if (pathParts && pathParts.length === 4) {
				const serverName = pathParts[1];
				const namespace = pathParts[3];
				const serverSpec = await getServerSpec(serverName);
				if (serverSpec) {
					const isfsExtension = vscode.extensions.getExtension(OBJECTSCRIPT_EXTENSIONID);
					if (isfsExtension) {
						if (!isfsExtension.isActive) {
							await isfsExtension.activate();
							if (!isfsExtension.isActive) {
								vscode.window.showErrorMessage(`${OBJECTSCRIPT_EXTENSIONID} could not be activated.`, "Close");
								return;
							}
						}
					} else {
						vscode.window.showErrorMessage(`${OBJECTSCRIPT_EXTENSIONID} is not installed.`, "Close");
						return;
					}

					const params = [csp ? "csp" : "", project ? `project=${project}` : ""].filter(e => e != "").join("&");
					const uri = vscode.Uri.parse(`isfs${readonly ? "-readonly" : ""}://${serverName}:${namespace}${csp && webApp ? webApp : "/"}${params ? `?${params}` : ""}`);
					if ((vscode.workspace.workspaceFolders || []).filter((workspaceFolder) => workspaceFolder.uri.toString() === uri.toString()).length === 0) {
						const label = `${project ? `${project} - ${serverName}:${namespace}` : !csp ? `${serverName}:${namespace}` : ["", "/"].includes(uri.path) ? `${serverName}:${namespace} web files` : `${serverName} (${uri.path})`}${readonly && project == undefined ? " (read-only)" : ""}`;
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

	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.editWebApp`, async (webAppTreeItem?: WebAppTreeItem) => {
			await addWorkspaceFolderAsync(false, true, <NamespaceTreeItem>webAppTreeItem?.parent?.parent, undefined, webAppTreeItem?.name);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.viewWebApp`, async (webAppTreeItem?: WebAppTreeItem) => {
			await addWorkspaceFolderAsync(true, true, <NamespaceTreeItem>webAppTreeItem?.parent?.parent, undefined, webAppTreeItem?.name);
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
		 *  The returned object will not contain `password`. To get that:
		 * ```
		 *      const session: vscode.AuthenticationSession = await vscode.authentication.getSession('intersystems-server-credentials', [serverSpec.name, serverSpec.username]);
		 * ```
		 *    The `accessToken` property of the returned [`AuthenticationSession`](https://code.visualstudio.com/api/references/vscode-api#AuthenticationSession) is the password.
		 *
		 *  The `flushCredentialsCache` param is obsolete and has no effect;
		 *  The `noCredentials` property of `options` param is obsolete and has no effect;
		 *
		 * @param name Name of the server, used as the key into the 'intersystems.servers' settings object
		 * @param scope Settings scope to look in.
		 * @param flushCredentialCache Obsolete, has no effect.
		 * @param options
		 * @returns { IServerSpec } Server specification object.
		 */
		async getServerSpec(
			name: string,
			scope?: vscode.ConfigurationScope,
			flushCredentialCache: boolean = false,
			options?: { hideFromRecents?: boolean, /* Obsolete */ noCredentials?: boolean },
		): Promise<IServerSpec | undefined> {
			const spec = await getServerSpec(name, scope);
			if (spec && !options?.hideFromRecents) {
				await view.addToRecents(name);
			}
			return spec;
		},

		getAccount(serverSpec: IServerSpec): vscode.AuthenticationSessionAccountInformation | undefined {
			return getAccountFromParts(serverSpec.name, serverSpec.username);
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
