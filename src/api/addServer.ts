import * as vscode from "vscode";
import { IJSONServerSpec } from "@intersystems-community/intersystems-servermanager";
import { getServerNames } from "./getServerNames";

export async function addServer(
	scope?: vscode.ConfigurationScope,
	target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
): Promise<string | undefined> {
	const serverNames = getServerNames(scope);
	const spec: IJSONServerSpec = { webServer: { scheme: "", host: "", port: 0 } };
	return await vscode.window
		.showInputBox({
			ignoreFocusOut: true,
			title: "Enter name of new server definition",
			validateInput: (value) => {
				if (value === "") {
					return "Required";
				}
				if (serverNames.filter((server) => server.name === value).length) {
					return "Name already exists";
				}
				if (!value.match(/^[a-z0-9-_~]+$/)) {
					return "Can only contain a-z, 0-9 and punctuation -_~";
				}
				return null;
			},
		})
		.then(
			async (name): Promise<string | undefined> => {
				if (name) {
					const description = await vscode.window.showInputBox({
						ignoreFocusOut: true,
						title: "Optionally enter a description",
					});
					if (typeof description !== "undefined") {
						if (description) {
							spec.description = description.trim();
						}
						const host = await vscode.window.showInputBox({
							ignoreFocusOut: true,
							title: "Enter the hostname or IP address of the web server",
							validateInput: (value) => {
								return value.trim().length ? undefined : "Required";
							},
						});
						if (host) {
							spec.webServer.host = host.trim();
							const portString = await vscode.window.showInputBox({
								ignoreFocusOut: true,
								title: "Enter the port of the web server",
								validateInput: (value) => {
									const port = +value;
									return value.match(/\d+/) &&
										port.toString() === value &&
										port > 0 &&
										port < 65536
										? undefined
										: "Required, 1-65535";
								},
							});
							if (portString) {
								spec.webServer.port = +portString;
								const prefix = await vscode.window.showInputBox({
									ignoreFocusOut: true,
									title:
										"Optionally enter the path prefix of the instance",
								});
								if (typeof prefix !== "undefined") {
									if (prefix) {
										var pathPrefix = prefix.trim();
										if (!pathPrefix.startsWith("/")) {
											pathPrefix = "/" + pathPrefix;
										}
										if (pathPrefix.endsWith("/")) {
											pathPrefix = pathPrefix.slice(0, -1);
										}
										spec.webServer.pathPrefix = pathPrefix;
									}
								}

								const username = await vscode.window.showInputBox({
									ignoreFocusOut: true,
									title:
										"Enter the username",
									prompt:
										"Leave empty to be prompted when connecting.",
								});
								if (typeof username !== "undefined") {
									const usernameTrimmed = username.trim();
									if (usernameTrimmed !== "") {
										spec.username = usernameTrimmed;
									}
									const scheme = await new Promise<string | undefined>((resolve) => {
										let result: string;
										const quickPick = vscode.window.createQuickPick();
										quickPick.title = "Confirm the connection type, then the definition will be stored in your User Settings. 'Escape' to cancel.";
										quickPick.ignoreFocusOut = true;
										quickPick.items = [{ label: "http" }, { label: "https" }];
										quickPick.activeItems = [quickPick.items[spec.webServer.port == 443 ? 1 : 0]];
										quickPick.onDidChangeSelection((items) => {
											result = items[0].label;
										});
										quickPick.onDidAccept(() => {
											resolve(result);
											quickPick.hide();
											quickPick.dispose();
										});
										quickPick.onDidHide(() => {
											resolve(undefined);
											quickPick.dispose();
										});
										quickPick.show();
									});
									if (scheme) {
										spec.webServer.scheme = scheme;
										const levelStr =
											target == vscode.ConfigurationTarget.WorkspaceFolder ? "workspace-folder" :
												target == vscode.ConfigurationTarget.Workspace ? "workspace" :
													"user";
										try {
											const config = vscode.workspace.getConfiguration(
												"intersystems",
												scope,
											);
											const serversInspection = config.inspect("servers");
											const servers = (
												target == vscode.ConfigurationTarget.WorkspaceFolder ? serversInspection?.workspaceFolderValue :
													target == vscode.ConfigurationTarget.Workspace ? serversInspection?.workspaceValue :
														serversInspection?.globalValue
											) ?? {};
											servers[name] = spec;
											await config.update("servers", servers, target);
											vscode.window.showInformationMessage(`Server '${name}' stored in ${levelStr}-level settings.`);
											return name;
										} catch (error) {
											vscode.window.showErrorMessage(
												`Failed to store server '${name}' definition. Does your ${levelStr}-level settings file contain a JSON syntax error?`,
											);
											return undefined;
										}
									}
								}
							}
						}
					}
				}
			},
		);
}
