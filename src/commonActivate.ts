import * as vscode from "vscode";
import { IServerName, IServerSpec } from "@intersystems-community/intersystems-servermanager";
import { addServer } from "./api/addServer";
import { BrowserTarget, getPortalUriWithToken } from "./api/getPortalUriWithToken";
import { getServerNames } from "./api/getServerNames";
import { getServerSpec } from "./api/getServerSpec";
import { getServerSummary } from "./api/getServerSummary";
import { pickServer } from "./api/pickServer";
import { AUTHENTICATION_PROVIDER, ServerManagerAuthenticationProvider } from "./authenticationProvider";
import { logout, serverSessions } from "./makeRESTRequest";
import { NamespaceTreeItem, ProjectTreeItem, ServerManagerView, ServerTreeItem, SMTreeItem, WebAppTreeItem } from "./ui/serverManagerView";

export const extensionId = "consistem-sistemas.servermanager";
export const OBJECTSCRIPT_EXTENSIONID = "consistem-sistemas.vscode-objectscript";

export let globalState: vscode.Memento;

export function getAccountFromParts(serverName: string, userName?: string): vscode.AuthenticationSessionAccountInformation | undefined {
	const accountId = userName ? `${serverName}/${userName}` : undefined;
	return accountId ? { id: accountId, label: `${userName} on ${serverName}` } : undefined;
}

/**
 * Handle all activation requirements that are shared by `extension.ts` and `web-extension.ts`.
 * Returns our exported API.
 */
export function commonActivate(context: vscode.ExtensionContext, view: ServerManagerView): any {
	const _onDidChangePassword = new vscode.EventEmitter<string>();

	// Other parts of this extension will use this to persist state
	globalState = context.globalState;

	/** Helper function for adding a workspace folder */
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
								vscode.window.showErrorMessage(`${OBJECTSCRIPT_EXTENSIONID} could not be activated.`, "Dismiss");
								return;
							}
						}
					} else {
						vscode.window.showErrorMessage(`${OBJECTSCRIPT_EXTENSIONID} is not installed.`, "Dismiss");
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
							vscode.window.showErrorMessage(`Folder ${uri.toString()} could not be added.`, "Dismiss");
						}
					}
					// Switch to Explorer view and focus on the folder
					await vscode.commands.executeCommand("revealInExplorer", uri);
				}
			}
		}
	};

	const authProvider = new ServerManagerAuthenticationProvider(context.secrets);
	context.subscriptions.push(
		// Register our authentication provider. NOTE: this will register the provider globally which means that
		// any other extension can request to use use this provider via the `vscode.authentication.getSession` API.
		vscode.authentication.registerAuthenticationProvider(
			ServerManagerAuthenticationProvider.id,
			ServerManagerAuthenticationProvider.label,
			authProvider,
			{ supportsMultipleAccounts: true },
		),
		// Ensure cookies do not survive an account sign-out
		vscode.authentication.onDidChangeSessions((e) => {
			if (e.provider.id === AUTHENTICATION_PROVIDER) {
				serverSessions.forEach(async (serverSession) => {

					// Still logged in with the authentication provider?
					const scopes = [serverSession.serverName, serverSession.username];
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
		// Register the commands
		vscode.commands.registerCommand(`${extensionId}.refreshTree`, () => {
			view.refreshTree();
		}),
		vscode.commands.registerCommand(`${extensionId}.addServer`, async () => {
			let scope: vscode.ConfigurationScope | undefined;
			let target: vscode.ConfigurationTarget | undefined;
			if (vscode.workspace.workspaceFolders) {
				interface SettingsScope extends vscode.QuickPickItem {
					scope?: vscode.ConfigurationScope;
					target: vscode.ConfigurationTarget;
				}
				const options: SettingsScope[] = [{ label: "Global", detail: "User Settings", target: vscode.ConfigurationTarget.Global }];
				if (vscode.workspace.workspaceFile) {
					// The workspace is a file, so each folder may be its own option
					options.push(
						{ label: "Workspace", detail: vscode.workspace.workspaceFile.toString(true), target: vscode.ConfigurationTarget.Workspace },
						...vscode.workspace.workspaceFolders
							.filter(f => !["isfs", "isfs-readonly"].includes(f.uri.scheme))
							.map(f => {
								return { label: f.name, detail: f.uri.toString(true), scope: f, target: vscode.ConfigurationTarget.WorkspaceFolder };
							})
					);
				} else {
					// The workspace is a single local folder, so that is the only other option
					options.push({ label: "Workspace", detail: vscode.workspace.workspaceFolders[0]?.uri.toString(true) ?? "Current folder", target: vscode.ConfigurationTarget.Workspace });
				}
				const choice = await vscode.window.showQuickPick(options, {
					ignoreFocusOut: true,
					title: "Pick a settings scope in which to add the server definition"
				});
				if (!choice) return;
				scope = choice.scope;
				target = choice.target;
			} else {
				// No workspace is open, so global is the only option
				scope = undefined;
				target = vscode.ConfigurationTarget.Global;
			}
			const name = await addServer(scope, target);
			if (name) {
				await view.addToRecents(name);
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.addToStarred`, async (server?: ServerTreeItem) => {
			if (server?.contextValue?.match(/\.server\./) && server.name) {
				await view.addToFavorites(server.name);
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.removeFromStarred`, async (server?: ServerTreeItem) => {
			if (server?.contextValue?.endsWith(".starred") && server.name) {
				await view.removeFromFavorites(server.name);
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.removeFromRecent`, async (server?: ServerTreeItem) => {
			if (server?.name) {
				await view.removeFromRecents(server.name);
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.openPortalExternal`, (server?: ServerTreeItem) => {
			if (server?.contextValue?.match(/\.server\./) && server.name) {
				getPortalUriWithToken(BrowserTarget.EXTERNAL, server.name, undefined, undefined, server?.params?.serverSummary?.scope).then((uriWithToken) => {
					if (uriWithToken) {
						vscode.env.openExternal(uriWithToken);
					}
				});
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.openPortalTab`, (server?: ServerTreeItem) => {
			if (server?.contextValue?.match(/\.server\./) && server.name) {
				getPortalUriWithToken(BrowserTarget.SIMPLE, server.name, undefined, undefined, server?.params?.serverSummary?.scope).then((uriWithToken) => {
					if (uriWithToken) {
						//
						// It is essential to pass skipEncoding=true when converting the uri to a string,
						// otherwise the querystring's & and = get encoded.
						vscode.commands.executeCommand("simpleBrowser.show", uriWithToken.toString(true));
					}
				});
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.openPortalExplorerExternal`, (namespaceTreeItem?: NamespaceTreeItem) => {
			if (namespaceTreeItem) {
				const pathParts = namespaceTreeItem.id?.split(":");
				if (pathParts && pathParts.length === 4) {
					const serverName = pathParts[1];
					const namespace = pathParts[3];
					getPortalUriWithToken(BrowserTarget.EXTERNAL, serverName, "/csp/sys/exp/%25CSP.UI.Portal.ClassList.zen", namespace, namespaceTreeItem.parent?.parent?.params?.serverSummary?.scope).then((uriWithToken) => {
						if (uriWithToken) {
							vscode.env.openExternal(uriWithToken);
						}
					});
				}
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.editSettings`, (server?: ServerTreeItem) => {
			// Attempt to open the correct JSON file
			server = server instanceof ServerTreeItem ? server : undefined;
			const scope: vscode.ConfigurationScope = server?.params?.serverSummary?.scope;
			const servers = vscode.workspace.getConfiguration("intersystems", scope).inspect<{ [key: string]: any }>("servers");
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
			// Only WorkspaceFolder objects have an index.
			if (server && servers?.workspaceFolderValue?.hasOwnProperty(server.name) && typeof (<vscode.WorkspaceFolder>scope)?.index == "number") {
				// Open the workspace folder settings file. Need to use showTextDocument because the
				// "workbench.action.openFolderSettingsFile" command always prompts the user.
				vscode.window.showTextDocument(
					vscode.Uri.joinPath((<vscode.WorkspaceFolder>scope).uri, ".vscode", "settings.json"),
					// Need these two properties to mimic the workbench commands' behavior
					{ preview: false, selection: new vscode.Range(0, 0, 0, 0) }
				).then(revealServer, () => {
					// If there's an error, fall back to showing the UI
					vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${extensionId}`);
				});
			} else if (server && servers?.workspaceValue?.hasOwnProperty(server.name)) {
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
		vscode.commands.registerCommand(`${extensionId}.setIconRed`, (server?: ServerTreeItem) => {
			if (server?.name) {
				view.setIconColor(server.name, "red");
				view.refreshTree();
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.setIconOrange`, (server?: ServerTreeItem) => {
			if (server?.name) {
				view.setIconColor(server.name, "orange");
				view.refreshTree();
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.setIconYellow`, (server?: ServerTreeItem) => {
			if (server?.name) {
				view.setIconColor(server.name, "yellow");
				view.refreshTree();
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.setIconGreen`, (server?: ServerTreeItem) => {
			if (server?.name) {
				view.setIconColor(server.name, "green");
				view.refreshTree();
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.setIconBlue`, (server?: ServerTreeItem) => {
			if (server?.name) {
				view.setIconColor(server.name, "blue");
				view.refreshTree();
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.setIconPurple`, (server?: ServerTreeItem) => {
			if (server?.name) {
				view.setIconColor(server.name, "purple");
				view.refreshTree();
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.resetIconColor`, (server?: ServerTreeItem) => {
			if (server?.name) {
				view.setIconColor(server.name, undefined);
				view.refreshTree();
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.retryServer`, (treeItem: SMTreeItem) => {
			const depth = treeItem?.id?.split(":").length;
			if (depth === 2) {
				view.refreshTree(treeItem);
			} else if (depth === 3) {
				view.refreshTree(treeItem.parent);
			} else if (depth === 4) {
				view.refreshTree(treeItem.parent?.parent);
			}
		}),
		vscode.commands.registerCommand(`${extensionId}.editNamespace`,
			async (namespaceTreeItem?: ServerTreeItem) => {
				await addWorkspaceFolderAsync(false, false, namespaceTreeItem);
			}),
		vscode.commands.registerCommand(`${extensionId}.viewNamespace`,
			async (namespaceTreeItem?: ServerTreeItem) => {
				await addWorkspaceFolderAsync(true, false, namespaceTreeItem);
			}),
		vscode.commands.registerCommand(`${extensionId}.editNamespaceWebAppFiles`,
			async (namespaceTreeItem?: ServerTreeItem) => {
				await addWorkspaceFolderAsync(false, true, namespaceTreeItem);
			}),
		vscode.commands.registerCommand(`${extensionId}.viewNamespaceWebAppFiles`,
			async (namespaceTreeItem?: ServerTreeItem) => {
				await addWorkspaceFolderAsync(true, true, namespaceTreeItem);
			}),
		vscode.commands.registerCommand(`${extensionId}.editProject`, async (projectTreeItem?: ProjectTreeItem) => {
			await addWorkspaceFolderAsync(false, false, <NamespaceTreeItem>projectTreeItem?.parent?.parent, projectTreeItem?.name);
		}),
		vscode.commands.registerCommand(`${extensionId}.viewProject`, async (projectTreeItem?: ProjectTreeItem) => {
			await addWorkspaceFolderAsync(true, false, <NamespaceTreeItem>projectTreeItem?.parent?.parent, projectTreeItem?.name);
		}),
		vscode.commands.registerCommand(`${extensionId}.editWebApp`, async (webAppTreeItem?: WebAppTreeItem) => {
			await addWorkspaceFolderAsync(false, true, <NamespaceTreeItem>webAppTreeItem?.parent?.parent, undefined, webAppTreeItem?.name);
		}),
		vscode.commands.registerCommand(`${extensionId}.viewWebApp`, async (webAppTreeItem?: WebAppTreeItem) => {
			await addWorkspaceFolderAsync(true, true, <NamespaceTreeItem>webAppTreeItem?.parent?.parent, undefined, webAppTreeItem?.name);
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => view.refreshTree()),
		vscode.commands.registerCommand(`${extensionId}.signOut`, async () => {
			const sessions = await authProvider.getSessions(undefined, {}).catch(() => { });
			if (!sessions?.length) {
				vscode.window.showInformationMessage("There are no stored accounts to sign out of.", "Dismiss");
				return;
			}
			const picks = await vscode.window.showQuickPick(sessions.map((s) => s.account), { canPickMany: true, title: "Pick the accounts to sign out of" });
			if (!picks?.length) return;
			return authProvider.removeSessions(picks.map((p) => p.id));
		}),
		// Listen for relevant configuration changes
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("intersystems.servers") || e.affectsConfiguration("objectscript.conn")) {
				view.refreshTree();
			}
		})
	);

	// Create our exported API
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

	// 'export' the API
	return api;
}
