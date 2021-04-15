import * as vscode from 'vscode';
import { getServerNames } from '../api/getServerNames';
import { credentialCache, getServerSpec } from '../api/getServerSpec';
import { getServerSummary } from '../api/getServerSummary';
import { ServerName } from '../extension';
import { makeRESTRequest } from '../makeRESTRequest';

const SETTINGS_VERSION = 'v1';

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

    private _treeView: vscode.TreeView<SMTreeItem>;

    private _treeDataProvider: SMNodeProvider;

	constructor(context: vscode.ExtensionContext) {
        this._globalState = context.globalState;
        const treeDataProvider = new SMNodeProvider();
        this._treeDataProvider = treeDataProvider;
        
        const treeView = vscode.window.createTreeView('intersystems-community_servermanager', { treeDataProvider, showCollapseAll: true })
        this._treeView = treeView;
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

    async addToRecents(name: string) {
        if (recentsArray[0] !== name) {
            recentsArray = recentsArray.filter((n) => n !== name);
            if (recentsArray.unshift(name) > 8) {
                recentsArray.pop()
            }

            // Delay the refresh to avoid startling the user by updating the tree the instant they click on a command button
            setTimeout(() => this.refreshTree(), 1000);
            await this._globalState.update(StorageIds.recents, recentsArray);
        }
    }

    async addToFavorites(name: string) {
        if (!favoritesMap.has(name)) {
            favoritesMap.set(name, null);
            await this._globalState.update(StorageIds.favorites, Array.from(favoritesMap.keys()));
            this.refreshTree();
        }
    }

    async removeFromFavorites(name: string) {
        if (favoritesMap.delete(name)) {
            await this._globalState.update(StorageIds.favorites, Array.from(favoritesMap.keys()));
            this.refreshTree();
        }
    };

    async setIconColor(name: string, color: string | undefined) {
        let changed = false;
        if (typeof color === 'undefined') {
            changed =  colorsMap.delete(name);
        }
        else if (colorsMap.get(name) !== color) {
            colorsMap.set(name, color);
            changed = true;
        }
        if (changed) {
            await this._globalState.update(StorageIds.iconColors, Array.from(colorsMap.entries()));
        }
    };

    refreshTree() {
        this._treeDataProvider.refresh();
    }

}

class SMNodeProvider implements vscode.TreeDataProvider<SMTreeItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<SMTreeItem | undefined | void> = new vscode.EventEmitter<SMTreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<SMTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    view: vscode.TreeView<SMTreeItem>;
    private _firstRevealDone = false;
    private _firstRevealItem: SMTreeItem;

	constructor() {
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element:SMTreeItem): vscode.TreeItem {
		return element;
	}

    getParent(element: SMTreeItem): SMTreeItem | undefined {
        // This is a hack to allow reveal() to work on the first-level folders,
        // so we can open one of them automatically at startup.
        // TODO implement it properly for all items.
        return undefined;
    }

	async getChildren(element?: SMTreeItem): Promise<SMTreeItem[] | undefined> {
        const children: SMTreeItem[] = [];
		if (!element) {
            // Root folders
            let firstRevealId = favoritesMap.size > 0 ? 'starred' : recentsArray.length > 0 ? 'recent' : 'sorted';

            if (vscode.workspace.workspaceFolders?.length || 0 > 0) {
                children.push(new SMTreeItem({parent: element, label: 'Current', id: 'current', tooltip: 'Servers referenced by current workspace', codiconName: 'home', getChildren: currentServers}));
                firstRevealId = 'current';
                this._firstRevealItem = children[children.length - 1];
            }

            if (favoritesMap.size > 0) {
                children.push(new SMTreeItem({parent: element, label: 'Starred', id: 'starred', tooltip: 'Favorite servers', codiconName: 'star-full', getChildren: favoriteServers}));
                if (firstRevealId === 'starred') {
                    this._firstRevealItem = children[children.length - 1];
                }
            }
            children.push(new SMTreeItem({parent: element, label: 'Recent', id: 'recent', tooltip: 'Recently used servers', codiconName: 'history', getChildren: recentServers}));
            if (firstRevealId === 'recent') {
                this._firstRevealItem = children[children.length - 1];
            }

            // TODO - use this when we can implement resequencing in the UI
            // children.push(new SMTreeItem({parent: element, label: 'Ordered', id: 'ordered', tooltip: 'All servers in settings.json order', codiconName: 'list-ordered', getChildren: allServers, params: {sorted: false}}));

            children.push(new SMTreeItem({parent: element, label: 'All Servers', id: 'sorted', tooltip: 'All servers in alphabetical order', codiconName: 'server-environment', getChildren: allServers, params: {sorted: true}}));
            if (firstRevealId === 'sorted') {
                this._firstRevealItem = children[children.length - 1];
            }

            setTimeout(async () => {
                if (!this._firstRevealDone && this._firstRevealItem) {
                    await this.view.reveal(this._firstRevealItem, {select: false, expand: 1});
                    this._firstRevealDone = true;
                    }
        
            }, 20);
    
            return children;
		}
        else {
            return await element.getChildren();
        }
	}
}

interface SMItem {
    label: string,
    id: string,
    parent: SMTreeItem | undefined,
    contextValue?: string,
    tooltip?: string | vscode.MarkdownString,
    description?: string,
    codiconName?: string,
    getChildren?: Function,
    params?: any,
}

class SMTreeItem extends vscode.TreeItem {

    private readonly _getChildren?: Function;
    private readonly _params?: any;

    readonly parent: SMTreeItem | undefined;

	constructor(item: SMItem) {
        const collapsibleState = item.getChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
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
        this._params = item.params;
	}

    public async getChildren(): Promise<SMTreeItem[] | undefined> {
        if (this._getChildren) {
            return await this._getChildren(this, this._params);
        }
        else {
            return;
        }
    }
}

function allServers(treeItem: SMTreeItem, params?: any): ServerTreeItem[] {
    const children: ServerTreeItem[] = [];
    const getAllServers = (sorted?: boolean): ServerTreeItem[] => {
        let serverNames = getServerNames();
        if (sorted) {
            serverNames = serverNames.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        }
        return serverNames.map((serverName) => {
            return new ServerTreeItem({ label: serverName.name, id:serverName.name, parent: treeItem }, serverName);
        })
    }
    
    getAllServers(params.sorted).map((server) => children.push(server));
    return children;
}

function currentServers(element: SMTreeItem, params?: any): ServerTreeItem[] {
    const children = new Map<string, ServerTreeItem>();

    vscode.workspace.workspaceFolders?.map((folder) => {
        const serverName = folder.uri.authority.split(':')[0];
        if (['isfs', 'isfs-readonly'].includes(folder.uri.scheme)) {
            const serverSummary = getServerSummary(serverName);
            if (serverSummary) {
                children.set(serverName, new ServerTreeItem({ parent: element, label: serverName, id: serverName }, serverSummary));
            }
        }
        const conn = vscode.workspace.getConfiguration('objectscript.conn', folder);
        const connServer = conn.get<string>('server');
        if (connServer) {
            const serverSummary = getServerSummary(connServer);
            if (serverSummary) {
                children.set(connServer, new ServerTreeItem({ parent: element, label: serverName, id: serverName }, serverSummary));
            }
        }
    });

    return Array.from(children.values()).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function favoriteServers(element: SMTreeItem, params?: any): ServerTreeItem[] {
    const children: ServerTreeItem[] = [];

    favoritesMap.forEach((_, name) => {
        const serverSummary = getServerSummary(name);
        if (serverSummary) {
            children.push(new ServerTreeItem({ parent: element, label: name, id: name}, serverSummary));
        }
    });

    return children.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function recentServers(element: SMTreeItem, params?: any): ServerTreeItem[] {
    const children: ServerTreeItem[] = [];

    recentsArray.map((name) => {
        const serverSummary = getServerSummary(name);
        if (serverSummary) {
            children.push(new ServerTreeItem({ parent: element, label: name, id: name}, serverSummary));
        }
    });

    return children;
}

export class ServerTreeItem extends SMTreeItem {
    public readonly name: string;
	constructor(
        element: SMItem,
		serverSummary: ServerName
	) {
        const parentFolderId = element.parent?.id || "";
        // Wrap detail (a uri string) as a null link to prevent it from being linkified
		super({
            parent: element.parent,
            label: serverSummary.name,
            id: parentFolderId + ':' + serverSummary.name,
            tooltip: new vscode.MarkdownString(`[${serverSummary.detail}]()`).appendMarkdown(serverSummary.description ? `\n\n*${serverSummary.description}*` : ''),
            getChildren: serverFeatures,
            params: { serverSummary }
        });
        this.name = serverSummary.name;
        //this.command = {command: 'intersystems-community.servermanager.openPortalTab', title: 'Open Management Portal in Simple Browser Tab', arguments: [this]};
        this.contextValue = `${parentFolderId}.server.${favoritesMap.has(this.name) ? 'starred' : ''}`;
        const color = colorsMap.get(this.name);
        this.iconPath = new vscode.ThemeIcon('server-environment', color ? new vscode.ThemeColor('charts.' + color) : undefined);
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
        const name = params.serverSummary.name;
        const serverSpec = await getServerSpec(name)
        if (!serverSpec) {
            return undefined
        }
        
        const response = await makeRESTRequest("HEAD", serverSpec)
        if (!response) {
            children.push(new OfflineTreeItem({ parent: element, label: name, id: name }, element.name));
            credentialCache[name] = undefined;
        }
        else {
            children.push(new NamespacesTreeItem({ parent: element, label: name, id: name }, element.name));
        }
    }
    return children;
}

export class FeatureTreeItem extends SMTreeItem {
}

export class OfflineTreeItem extends FeatureTreeItem {
    public readonly name: string;
	constructor(
        element: SMItem,
        serverName: string
	) {
        const parentFolderId = element.parent?.id || '';
		super({
            parent: element.parent,
            label: `Offline at ${new Date().toLocaleTimeString()}`,
            id: parentFolderId + ':offline',
            tooltip: `Server could not be reached`,
        });
        this.name = 'offline';
        this.contextValue = 'offline';
        this.iconPath = new vscode.ThemeIcon('warning');
	}
}

export class NamespacesTreeItem extends FeatureTreeItem {
    public readonly name: string;
	constructor(
        element: SMItem,
        serverName: string
	) {
        const parentFolderId = element.parent?.id || '';
		super({
            parent: element.parent,
            label: 'Namespaces',
            id: parentFolderId + ':namespaces',
            tooltip: `Namespaces you can access`,
            getChildren: serverNamespaces,
            params: { serverName }
        });
        this.name = 'Namespaces';
        this.contextValue = 'namespaces';
        this.iconPath = new vscode.ThemeIcon('library');
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
        const serverSpec = await getServerSpec(name)
        if (!serverSpec) {
            return undefined
        }
        
        const response = await makeRESTRequest("GET", serverSpec)
        if (!response) {
            children.push(new OfflineTreeItem({ parent: element, label: name, id: name }, element.name));
            credentialCache[params.serverName] = undefined;
        }
        else {
            response.data.result.content.namespaces.map((namespace) => {
                children.push(new NamespaceTreeItem({ parent: element, label: name, id: name }, namespace, name));
            });
        }
    }

    return children;
}

export class NamespaceTreeItem extends SMTreeItem {
    public readonly name: string;
	constructor(
        element: SMItem,
        name: string,
        serverName: string
	) {
        const parentFolderId = element.parent?.id || '';
        const id = parentFolderId + ':' + name;
		super({
            parent: element.parent,
            label: name,
            id,
            tooltip: `${name} on ${serverName}`
        });
        this.name = name;
        this.contextValue = name === '%SYS' ? 'sysnamespace' : 'namespace';
        this.iconPath = new vscode.ThemeIcon('archive');
	}
}
