import * as vscode from "vscode";
import { getServerNames } from "../api/getServerNames";
import { getServerSpec } from "../api/getServerSpec";
import { getServerSummary } from "../api/getServerSummary";
import { IServerName, IServerSpec } from "@intersystems-community/intersystems-servermanager";
import { makeRESTRequest } from "../makeRESTRequest";
import { OBJECTSCRIPT_EXTENSIONID } from "../commonActivate";

const SETTINGS_VERSION = "v1";

// tslint:disable-next-line: no-namespace
namespace StorageIds {
	export const favorites = `tree.${SETTINGS_VERSION}.favorites`;
	export const recents = `tree.${SETTINGS_VERSION}.recents`;
	export const iconColors = `tree.${SETTINGS_VERSION}.iconColors`;
}

const favoritesMap = new Map<string, null>();

const colorsMap = new Map<string, string>();

let recentsArray: string[] = [];

export class ServerManagerView {

	private _globalState: vscode.Memento;

	private _treeDataProvider: SMNodeProvider;

	constructor(context: vscode.ExtensionContext) {
		this._globalState = context.globalState;
		const treeDataProvider = new SMNodeProvider();
		this._treeDataProvider = treeDataProvider;
		const treeView = vscode.window.createTreeView(
			"intersystems-community_servermanager",
			{ treeDataProvider, showCollapseAll: true },
		);
		context.subscriptions.push(treeView);
		treeDataProvider.view = treeView;

		// load favoritesMap
		const favorites = this._globalState.get<string[]>(StorageIds.favorites) || [];
		favorites.forEach((name) => favoritesMap.set(name, null));

		// load recentsArray
		recentsArray = this._globalState.get<string[]>(StorageIds.recents) || [];

		// load colorsMap
		const colors = this._globalState.get<string[]>(StorageIds.iconColors) || [];
		colors.forEach((pair) => colorsMap.set(pair[0], pair[1]));
	}

	public async addToRecents(name: string) {
		if (recentsArray[0] !== name) {
			recentsArray = recentsArray.filter((n) => n !== name);
			if (recentsArray.unshift(name) > 8) {
				recentsArray.pop();
			}

			// Delay the refresh to avoid startling the user by updating the tree
			// the instant they click on a command button
			setTimeout(() => this.refreshTree(), 1000);
			await this._globalState.update(StorageIds.recents, recentsArray);
		}
	}

	public async removeFromRecents(name: string) {
		recentsArray = recentsArray.filter((n) => n !== name);
		this.refreshTree();
		await this._globalState.update(StorageIds.recents, recentsArray);
	}

	public async addToFavorites(name: string) {
		if (!favoritesMap.has(name)) {
			favoritesMap.set(name, null);
			await this._globalState.update(StorageIds.favorites, Array.from(favoritesMap.keys()));
			this.refreshTree();
		}
	}

	public async removeFromFavorites(name: string) {
		if (favoritesMap.delete(name)) {
			await this._globalState.update(StorageIds.favorites, Array.from(favoritesMap.keys()));
			this.refreshTree();
		}
	}

	public async setIconColor(name: string, color: string | undefined) {
		let changed = false;
		if (typeof color === "undefined") {
			changed = colorsMap.delete(name);
		} else if (colorsMap.get(name) !== color) {
			colorsMap.set(name, color);
			changed = true;
		}
		if (changed) {
			await this._globalState.update(StorageIds.iconColors, Array.from(colorsMap.entries()));
		}
	}

	public refreshTree(item?: SMTreeItem | undefined) {
		this._treeDataProvider.refresh(item);
	}

}

// tslint:disable-next-line: max-classes-per-file
class SMNodeProvider implements vscode.TreeDataProvider<SMTreeItem> {

	// tslint:disable-next-line: max-line-length
	private _onDidChangeTreeData: vscode.EventEmitter<SMTreeItem | undefined | void> = new vscode.EventEmitter<SMTreeItem | undefined | void>();
	// tslint:disable-next-line: member-ordering
	public readonly onDidChangeTreeData: vscode.Event<SMTreeItem | undefined | void> = this._onDidChangeTreeData.event;

	// tslint:disable-next-line: member-ordering
	public view: vscode.TreeView<SMTreeItem>;
	private _firstRevealDone = false;
	private _firstRevealItem: SMTreeItem;

	public refresh(item: SMTreeItem | undefined): void {
		this._onDidChangeTreeData.fire(item);
	}

	public getTreeItem(element: SMTreeItem): vscode.TreeItem {
		return element;
	}

	public getParent(element: SMTreeItem): SMTreeItem | undefined {
		// This is a hack to allow reveal() to work on the first-level folders,
		// so we can open one of them automatically at startup.
		// TODO implement it properly for all items.
		return undefined;
	}

	public async getChildren(element?: SMTreeItem): Promise<SMTreeItem[] | undefined> {
		const children: SMTreeItem[] = [];
		if (!element) {
			// Root folders
			let firstRevealId = favoritesMap.size > 0 ? "starred" : recentsArray.length > 0 ? "recent" : "sorted";

			if (vscode.workspace.workspaceFolders?.length || 0 > 0) {
				children.push(
					new SMTreeItem({
						codiconName: "home",
						contextValue: "current",
						getChildren: currentServers,
						id: "current",
						label: "Current",
						parent: element,
						tooltip: "Servers referenced by current workspace",
					}),
				);
				firstRevealId = "current";
				this._firstRevealItem = children[children.length - 1];
			}

			if (favoritesMap.size > 0) {
				children.push(new SMTreeItem({ parent: element, label: "Favorites", id: "starred", contextValue: "starred", tooltip: "Favorite servers", codiconName: "star-full", getChildren: favoriteServers }));
				if (firstRevealId === "starred") {
					this._firstRevealItem = children[children.length - 1];
				}
			}
			children.push(
				new SMTreeItem({
					codiconName: "history",
					contextValue: "recent",
					getChildren: recentServers,
					id: "recent",
					label: "Recent",
					parent: element,
					tooltip: "Recently used servers",
				}),
			);
			if (firstRevealId === "recent") {
				this._firstRevealItem = children[children.length - 1];
			}

			// TODO - use this when we can implement resequencing in the UI
			// children.push(new SMTreeItem({parent: element, label: 'Ordered', id: 'ordered',
			//  contextValue: 'ordered', tooltip: 'All servers in settings.json order',
			//  codiconName: 'list-ordered', getChildren: allServers, params: {sorted: false}}));

			children.push(
				new SMTreeItem({
					codiconName: "server-environment",
					contextValue: "sorted",
					getChildren: allServers,
					id: "sorted",
					label: "All Servers",
					params: { sorted: true },
					parent: element,
					tooltip: "All servers in alphabetical order",
				}),
			);
			if (firstRevealId === "sorted") {
				this._firstRevealItem = children[children.length - 1];
			}

			setTimeout(async () => {
				if (!this._firstRevealDone && this._firstRevealItem) {
					await this.view.reveal(this._firstRevealItem, { select: false, expand: 1 });
					this._firstRevealDone = true;
				}
			},
				20);

			return children;
		} else {
			return await element.getChildren();
		}
	}
}

interface ISMItem {
	label: string;
	id: string;
	parent: SMTreeItem | undefined;
	contextValue?: string;
	tooltip?: string | vscode.MarkdownString;
	description?: string;
	codiconName?: string;
	// tslint:disable-next-line: ban-types
	getChildren?: Function;
	params?: any;
}

// tslint:disable-next-line: max-classes-per-file
export class SMTreeItem extends vscode.TreeItem {

	public readonly parent: SMTreeItem | undefined;
	// tslint:disable-next-line: ban-types
	private readonly _getChildren?: Function;
	public readonly params?: any;

	constructor(item: ISMItem) {
		const collapsibleState = item.getChildren
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.None;
		super(item.label, collapsibleState);

		this.id = item.id;
		this.parent = item.parent;
		this.contextValue = item.contextValue;
		this.tooltip = item.tooltip;
		this.description = item.description;
		if (item.codiconName) {
			this.iconPath = new vscode.ThemeIcon(item.codiconName);
		}
		this._getChildren = item.getChildren;
		this.params = item.params;
	}

	public async getChildren(): Promise<SMTreeItem[] | undefined> {
		if (this._getChildren) {
			return await this._getChildren(this, this.params);
		} else {
			return;
		}
	}
}

function allServers(treeItem: SMTreeItem, params?: any): ServerTreeItem[] {
	const children: ServerTreeItem[] = [];
	// Add children for servers defined at the user or workspace level
	const wsServerNames = getServerNames(undefined);
	const wsIsFolder = !vscode.workspace.workspaceFile;
	const conf = vscode.workspace.getConfiguration("intersystems.servers");
	children.push(...wsServerNames.map((wss) => {
		// If the server is defined at the workspace level and the workspace is a folder then it's effectively defined at the workspace folder level
		return new ServerTreeItem({ label: `${wss.name}${wsIsFolder && typeof conf.inspect(wss.name)?.workspaceValue == "object" ? ` (${(vscode.workspace.workspaceFolders ?? [])[0]?.name})` : ""}`, id: wss.name, parent: treeItem }, wss);
	}));
	// Add children for servers defined at the workspace folder level
	vscode.workspace.workspaceFolders?.map((wf) => {
		if (["isfs", "isfs-readonly"].includes(wf.uri.scheme)) return;
		children.push(...getServerNames(wf).filter((wfs) => !wsServerNames.some((wss) => wss.name == wfs.name)).map((wfs) => {
			return new ServerTreeItem({ label: `${wfs.name} (${wf.name})`, id: wfs.name, parent: treeItem }, wfs);
		}));
	});
	if (params?.sorted) children.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	return children;
}

async function currentServers(element: SMTreeItem, params?: any): Promise<ServerTreeItem[]> {
	const children = new Map<string, ServerTreeItem>();
	const dockerLocalPorts = new Map<number, string>();

	const workspaceFolders = vscode.workspace.workspaceFolders || [];
	await Promise.all(workspaceFolders.map(async (folder) => {
		const serverName = folder.uri.authority.split(":")[0];
		if (["isfs", "isfs-readonly"].includes(folder.uri.scheme)) {
			const serverSummary = getServerSummary(serverName, folder);
			if (serverSummary) {
				children.set(
					serverName,
					new ServerTreeItem({ parent: element, label: serverName, id: serverName }, serverSummary),
				);
			}
			return;
		}
		const conn = vscode.workspace.getConfiguration("objectscript.conn", folder);
		const connServer = conn.get<string>("server");
		if (conn.get("docker-compose")) {
			const objectScriptExtension = vscode.extensions.getExtension(OBJECTSCRIPT_EXTENSIONID);
			if (objectScriptExtension) {
				if (!objectScriptExtension.isActive) {
					await objectScriptExtension.activate();
				}
				if (objectScriptExtension.isActive && objectScriptExtension.exports?.asyncServerForUri) {
					const server = await objectScriptExtension.exports.asyncServerForUri(folder.uri);
					if (server && server.host === "localhost" && server.port > 0 && !dockerLocalPorts.has(server.port)) {
						dockerLocalPorts.set(server.port, folder.name);
					}
				}
			}
		} else if (connServer) {
			const serverSummary = getServerSummary(connServer, folder);
			if (serverSummary) {
				const inspection = vscode.workspace.getConfiguration("intersystems.servers", folder).inspect(connServer);
				// If the server is defined at the workspace level and the workspace is a folder then it's effectively defined at the workspace folder level
				const key = `${connServer}${typeof inspection?.workspaceFolderValue == "object" || (typeof inspection?.workspaceValue == "object" && !vscode.workspace.workspaceFile)
					? ` (${folder.name})` : ""
					}`;
				children.set(
					key,
					new ServerTreeItem({ parent: element, label: key, id: serverName }, serverSummary),
				);
			}
		}

	}));

	dockerLocalPorts.forEach((name, port) => {
		if (!children.has(name)) {
			const serverSummary: IServerName = { name, description: `Docker service bound to local port ${port} for folder '${name}'`, detail: `http://localhost:${port}/` };
			children.set(
				name,
				new ServerTreeItem({ parent: element, label: `docker:${port}`, id: name }, serverSummary),
			);
		}
	})

	return Array.from(children.values()).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function favoriteServers(element: SMTreeItem, params?: any): ServerTreeItem[] {
	const children: ServerTreeItem[] = [];

	favoritesMap.forEach((_, name) => {
		const serverSummary = getServerSummary(name);
		if (serverSummary) {
			children.push(new ServerTreeItem({ parent: element, label: name, id: name }, serverSummary));
		}
	});

	return children.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function recentServers(element: SMTreeItem, params?: any): ServerTreeItem[] {
	const children: ServerTreeItem[] = [];

	recentsArray.map((name) => {
		const serverSummary = getServerSummary(name);
		if (serverSummary) {
			children.push(new ServerTreeItem({ parent: element, label: name, id: name }, serverSummary));
		}
	});

	return children;
}

// tslint:disable-next-line: max-classes-per-file
export class ServerTreeItem extends SMTreeItem {
	public readonly name: string;
	constructor(
		element: ISMItem,
		serverSummary: IServerName,
	) {
		const parentFolderId = element.parent?.id || "";
		// Convert linebreaks etc, escape Markdown characters, truncate
		const escapedDescription = serverSummary.description
			.replace(/[\n\t]/g, " ")
			.replace(/[\r\f\b]/g, "")
			.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&")
			.slice(0, 90)
			.trim();
		// Wrap detail (a uri string) as a null link to prevent it from being linkified
		const wrappedDetail = `[${serverSummary.detail}]()`;
		super({
			getChildren: serverFeatures,
			id: parentFolderId + ":" + serverSummary.name,
			label: element.label ? element.label : serverSummary.name,
			params: { serverSummary },
			parent: element.parent,
			tooltip: new vscode.MarkdownString(wrappedDetail).appendMarkdown(escapedDescription ? `\n\n*${escapedDescription}*` : ""),
		});
		this.name = serverSummary.name;
		this.contextValue = `${parentFolderId}.server.${favoritesMap.has(this.name) ? "starred" : ""}`;
		const color = colorsMap.get(this.name);
		this.iconPath = new vscode.ThemeIcon(
			"server-environment",
			color ? new vscode.ThemeColor("charts." + color) : undefined,
		);
	}
}

/**
 * getChildren function returning server features (the child nodes of a server),
 *
 * @param element parent
 * @param params (unused)
 * @returns feature folders of a server.
 */
async function serverFeatures(element: ServerTreeItem, params?: any): Promise<FeatureTreeItem[] | undefined> {
	const children: FeatureTreeItem[] = [];

	if (params?.serverSummary) {
		let serverSpec = await specFromServerSummary(params.serverSummary);
		if (!serverSpec) {
			return undefined;
		}

		const name = serverSpec.name;
		try {
			let response = await makeRESTRequest("HEAD", serverSpec);
			if (response?.status === 401) {
				// Authentication error, so retry in case first attempt cleared a no-longer-valid stored password
				serverSpec.password = undefined;
				response = await makeRESTRequest("HEAD", serverSpec);
			}
			if (response?.status !== 200) {
				children.push(new OfflineTreeItem({ parent: element, label: name, id: name }, serverSpec.username || 'UnknownUser', `${response.status} ${response.statusText}`));
			} else {
				children.push(new NamespacesTreeItem({ parent: element, label: name, id: name }, element.name, serverSpec, serverSpec.username || 'UnknownUser'));
			}
		} catch (errorStr) {
			children.push(new OfflineTreeItem({ parent: element, label: name, id: name }, serverSpec.username || 'UnknownUser', errorStr));
		}
	}
	return children;
}

async function specFromServerSummary(serverSummary: IServerName): Promise<IServerSpec | undefined> {
	const { name, description, detail, scope } = serverSummary;
	const dockerDetail = detail.match(/^http:\/\/localhost:(\d+)\/$/);
	if (dockerDetail) {
		return { name, description, webServer: { scheme: "http", host: "127.0.0.1", port: parseInt(dockerDetail[1], 10), pathPrefix: "" } };
	}
	return getServerSpec(name, scope);
}

// tslint:disable-next-line: max-classes-per-file
export class FeatureTreeItem extends SMTreeItem {
}

// tslint:disable-next-line: max-classes-per-file
export class OfflineTreeItem extends FeatureTreeItem {
	public readonly name: string;
	constructor(
		element: ISMItem,
		username: string,
		errorStr: string,
	) {
		const parentFolderId = element.parent?.id || "";
		super({
			id: parentFolderId + ":offline",
			label: `Error at ${new Date().toLocaleTimeString()}`,
			parent: element.parent,
			tooltip: new vscode.MarkdownString(`Error accessing server as \`${username}\`${errorStr ? `:\n\n${errorStr}` : ""}`),
		});
		this.name = "offline";
		this.contextValue = "offline";
		this.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("problemsErrorIcon.foreground"));
	}
}

// tslint:disable-next-line: max-classes-per-file
export class NamespacesTreeItem extends FeatureTreeItem {
	public readonly name: string;
	constructor(
		element: ISMItem,
		serverName: string,
		serverSpec: IServerSpec,
		username: string
	) {
		const parentFolderId = element.parent?.id || "";
		super({
			getChildren: serverNamespaces,
			id: parentFolderId + ":namespaces",
			label: "Namespaces",
			params: { serverName, serverSpec },
			parent: element.parent,
			tooltip: `Namespaces '${username}' can access`,
		});
		this.name = "Namespaces";
		this.contextValue = "namespaces";
		this.iconPath = new vscode.ThemeIcon("library");
	}
}

/**
 * getChildren function returning namespaces of a server,
 *
 * @param element parent
 * @param params (unused)
 * @returns namespaces of a server.
 */
async function serverNamespaces(element: ServerTreeItem, params?: any): Promise<NamespaceTreeItem[] | undefined> {
	const children: NamespaceTreeItem[] = [];

	if (params?.serverName) {
		const name: string = params.serverName;
		const serverSpec: IServerSpec | undefined = params.serverSpec;
		if (!serverSpec) {
			return undefined;
		}

		try {
			const response = await makeRESTRequest("GET", serverSpec);
			if (response?.status !== 200) {
				children.push(new OfflineTreeItem({ parent: element, label: name, id: name }, serverSpec.username || 'UnknownUser', `${response.status} ${response.statusText}`));
			} else {
				const serverApiVersion = response.data.result.content.api;
				response.data.result.content.namespaces.map((namespace: string) => {
					children.push(new NamespaceTreeItem({ parent: element, label: name, id: name }, namespace, name, serverSpec, serverApiVersion));
				});
			}
		} catch (errorStr) {
			children.push(new OfflineTreeItem({ parent: element, label: name, id: name }, serverSpec.username || 'UnknownUser', errorStr));
		}
	}

	return children;
}

/** Returns `true` if `server` is a tree item representing a server defined at the workspace folder level */
function serverItemIsWsFolder(server?: SMTreeItem): boolean {
	return typeof server?.label == "string" && ((server.label.includes("(") && server.label.endsWith(")")) || server.label.startsWith("docker:"));
}

// tslint:disable-next-line: max-classes-per-file
export class NamespaceTreeItem extends SMTreeItem {
	public readonly name: string;
	constructor(
		element: ISMItem,
		name: string,
		serverName: string,
		serverSpec: IServerSpec,
		serverApiVersion: number
	) {
		const parentFolderId = element.parent?.id || "";
		const id = parentFolderId + ":" + name;
		super({
			id,
			label: name,
			parent: element.parent,
			tooltip: `${name} on ${serverName}`,
			getChildren: namespaceFeatures,
			params: { serverName, serverSpec, serverApiVersion }
		});
		this.name = name;
		this.contextValue = `${serverApiVersion.toString()}${serverItemIsWsFolder(element?.parent?.parent) ? "/wsFolder" : ""}/${name === "%SYS" ? "sysnamespace" : "namespace"}`;
		this.iconPath = new vscode.ThemeIcon("archive");
	}
}

/**
 * getChildren function returning namespace features (the child nodes of a server),
 *
 * @param element parent
 * @param params (unused)
 * @returns feature folders of a namespace.
 */
async function namespaceFeatures(element: NamespaceTreeItem, params?: any): Promise<FeatureTreeItem[] | undefined> {
	return [
		new ProjectsTreeItem({ parent: element, id: element.name, label: element.name }, params.serverName, params.serverSpec, params.serverApiVersion),
		new WebAppsTreeItem({ parent: element, id: element.name, label: element.name }, params.serverName, params.serverSpec, params.serverApiVersion)
	];
}

export class ProjectsTreeItem extends FeatureTreeItem {
	public readonly name: string;
	constructor(
		element: ISMItem,
		serverName: string,
		serverSpec: IServerSpec,
		serverApiVersion: number
	) {
		const parentFolderId = element.parent?.id || '';
		super({
			parent: element.parent,
			label: 'Projects',
			id: parentFolderId + ':projects',
			tooltip: `Projects in this namespace`,
			getChildren: namespaceProjects,
			params: { serverName, serverSpec, serverApiVersion, ns: element.label }
		});
		this.name = 'Projects';
		this.contextValue = serverApiVersion.toString() + '/projects';
		this.iconPath = new vscode.ThemeIcon('library');
	}
}

/**
 * getChildren function returning projects in a server namespace.
 *
 * @param element parent
 * @param params { serverName }
 * @returns projects in a server namespace.
 */
async function namespaceProjects(element: ProjectsTreeItem, params?: any): Promise<ProjectTreeItem[] | undefined> {
	const children: ProjectTreeItem[] = [];

	if (params?.serverName && params.ns) {
		const name: string = params.serverName;
		const serverSpec: IServerSpec | undefined = params.serverSpec;
		if (!serverSpec) {
			return undefined
		}

		const response = await makeRESTRequest(
			"POST",
			serverSpec,
			{ apiVersion: 1, namespace: params.ns, path: "/action/query" },
			{ query: "SELECT Name, Description FROM %Studio.Project", parameters: [] }
		);
		if (response?.status === 200) {
			if (response.data.result.content === undefined) {
				let message;
				if (response.data.status?.errors[0]?.code === 5540) {
					message = `To allow user '${serverSpec.username}' to list projects in namespace '${params.ns}', run this SQL statement there using an account with sufficient privilege: GRANT SELECT ON %Studio.Project TO "${serverSpec.username}"`;
				} else {
					message = response.data.status.summary;
				}
				vscode.window.showErrorMessage(message);
				return undefined;
			}
			response.data.result.content.map((project) => {
				children.push(new ProjectTreeItem({ parent: element, label: name, id: name }, project.Name, project.Description, params.serverApiVersion));
			});
		}
	}

	return children;
}

export class ProjectTreeItem extends SMTreeItem {
	public readonly name: string;
	constructor(
		element: ISMItem,
		name: string,
		description: string,
		serverApiVersion: number
	) {
		const parentFolderId = element.parent?.id || '';
		const id = parentFolderId + ':' + name;
		super({
			parent: element.parent,
			label: name,
			id,
			tooltip: description
		});
		this.name = name;
		this.contextValue = `${serverApiVersion.toString()}${serverItemIsWsFolder(element?.parent?.parent?.parent?.parent) ? "/wsFolder" : ""}/project`;
		this.iconPath = new vscode.ThemeIcon('files');
	}
}

export class WebAppsTreeItem extends FeatureTreeItem {
	public readonly name: string;
	constructor(
		element: ISMItem,
		serverName: string,
		serverSpec: IServerSpec,
		serverApiVersion: number
	) {
		const parentFolderId = element.parent?.id || '';
		super({
			parent: element.parent,
			label: 'Web Applications',
			id: parentFolderId + ':webapps',
			tooltip: `Web Applications in this namespace`,
			getChildren: namespaceWebApps,
			params: { serverName, serverSpec, serverApiVersion, ns: element.label }
		});
		this.name = 'Web Applications';
		this.contextValue = serverApiVersion.toString() + '/webapps';
		this.iconPath = new vscode.ThemeIcon('library');
	}
}

/**
 * getChildren function returning web applications in a server namespace.
 *
 * @param element parent
 * @param params { serverName }
 * @returns web applications in a server namespace.
 */
async function namespaceWebApps(element: ProjectsTreeItem, params?: any): Promise<WebAppTreeItem[] | undefined> {
	const children: ProjectTreeItem[] = [];

	if (params?.serverName && params.ns) {
		const name: string = params.serverName;
		const serverSpec: IServerSpec | undefined = params.serverSpec;
		if (!serverSpec) {
			return undefined
		}

		const response = await makeRESTRequest(
			"GET",
			serverSpec,
			{ apiVersion: 1, namespace: "%SYS", path: `/cspapps/${params.ns}` }
		);
		if (response?.status === 200) {
			if (response.data.result.content === undefined) {
				vscode.window.showErrorMessage(response.data.status.summary);
				return undefined;
			}
			response.data.result.content.map((webapp: string) => {
				children.push(new WebAppTreeItem({ parent: element, label: name, id: name }, webapp, params.serverApiVersion));
			});
		}
	}

	return children;
}

export class WebAppTreeItem extends SMTreeItem {
	public readonly name: string;
	constructor(element: ISMItem, name: string, serverApiVersion: number) {
		const parentFolderId = element.parent?.id || '';
		const id = parentFolderId + ':' + name;
		super({
			parent: element.parent,
			label: name,
			id
		});
		this.name = name;
		this.contextValue = `${serverApiVersion.toString()}${serverItemIsWsFolder(element?.parent?.parent?.parent?.parent) ? "/wsFolder" : ""}/webapp`;
		this.iconPath = new vscode.ThemeIcon('file-code');
	}
}
