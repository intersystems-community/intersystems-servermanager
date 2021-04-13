import * as vscode from 'vscode';
import { getServerNames } from '../api/getServerNames';
import { getServerSummary } from '../api/getServerSummary';
import { ServerName } from '../extension';

const SETTINGS_VERSION = 'v1';

namespace StorageIds {
	export const favorites = `tree.${SETTINGS_VERSION}.favorites`;
	export const iconColors = `tree.${SETTINGS_VERSION}.iconColors`;
}

const favoritesMap = new Map<string, null>();

const colorsMap = new Map<string, string>();

let recentsArray: string[] = [];

export class ServerManagerView {

    private _globalState: vscode.Memento;

    private _treeDataProvider: SMNodeProvider;

    addToRecents(name: string) {
        if (recentsArray[0] !== name) {
            recentsArray = recentsArray.filter((n) => n !== name);
            if (recentsArray.unshift(name) > 8) {
                recentsArray.pop()
            }

            // Delay the refresh to avoid startling the user by updating the tree the instant they click on a command button
            setTimeout(() => this.refreshTree(), 1000);
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

	constructor(context: vscode.ExtensionContext) {
        this._globalState = context.globalState;
        const treeDataProvider = new SMNodeProvider();
        this._treeDataProvider = treeDataProvider;
		context.subscriptions.push(
            vscode.window.createTreeView('intersystems-community_servermanager', { treeDataProvider, showCollapseAll: true })
        );

        // load favoritesMap
        const favorites = this._globalState.get<string[]>(StorageIds.favorites) || [];
        favorites.forEach((name) => favoritesMap.set(name, null));

        // load colorsMap
        const colors = this._globalState.get<string[]>(StorageIds.iconColors) || [];
        colors.forEach((pair) => colorsMap.set(pair[0], pair[1]));
	}
}

class SMNodeProvider implements vscode.TreeDataProvider<SMTreeItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<SMTreeItem | undefined | void> = new vscode.EventEmitter<SMTreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<SMTreeItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor() {
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element:SMTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: SMTreeItem): SMTreeItem[] {
        const children: SMTreeItem[] = [];
		if (!element) {
            if (vscode.workspace.workspaceFolders?.length || 0 > 0) {
                children.push(new SMTreeItem({label: 'Current', tooltip: 'Servers used by current workspace', codiconName: 'home', getChildren: currentServers}));
            }
            if (favoritesMap.size > 0) {
                children.push(new SMTreeItem({label: 'Starred', tooltip: 'Favorite servers', codiconName: 'star-full', getChildren: favoriteServers}));
            }
            children.push(new SMTreeItem({label: 'Recent', tooltip: 'Recently used servers', codiconName: 'history', getChildren: recentServers}));
            children.push(new SMTreeItem({label: 'Ordered', tooltip: 'All servers in settings.json order', codiconName: 'list-ordered', getChildren: allServers, params: {sorted: false}}));
            children.push(new SMTreeItem({label: 'Sorted', tooltip: 'All servers in alphabetical order', codiconName: 'triangle-down', getChildren: allServers, params: {sorted: true}}));
            return children;
		}
        else{
            return element.getChildren()
        }
	}
}

interface SMItem {
    label: string,
    contextValue?: string,
    tooltip?: string | vscode.MarkdownString,
    description?: string,
    codiconName?: string,
    getChildren?: Function,
    params?: any
}

class SMTreeItem extends vscode.TreeItem {

    private readonly _getChildren?: Function;
    private readonly _params?: any;

	constructor(item: SMItem) {
        const collapsibleState = item.getChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
		super(item.label, collapsibleState);

        this.contextValue = item.contextValue;
		this.tooltip = item.tooltip;
		this.description = item.description;
        if (item.codiconName) {
            this.iconPath = new vscode.ThemeIcon(item.codiconName);
        }
        this._getChildren = item.getChildren;
        this._params = item.params;
	}

    public getChildren(): SMTreeItem[] {
        if (this._getChildren) {
            return this._getChildren(this, this._params);
        }
        else {
            return [];
        }
    }
}

function allServers(element?: SMTreeItem, params?: any): ServerTreeItem[] {
    const children: ServerTreeItem[] = [];
    const getAllServers = (sorted?: boolean): ServerTreeItem[] => {
        let serverNames = getServerNames();
        if (sorted) {
            serverNames = serverNames.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        }
        return serverNames.map((serverName) => {
            return new ServerTreeItem(serverName, sorted ? 'sorted' : 'ordered');
        })
    }
    
    getAllServers(params.sorted).map((server) => children.push(server));
    return children;
}

function currentServers(element?: SMTreeItem, params?: any): ServerTreeItem[] {
    const children = new Map<string, ServerTreeItem>();

    vscode.workspace.workspaceFolders?.map((folder) => {
        const serverName = folder.uri.authority.split(':')[0];
        if (['isfs', 'isfs-readonly'].includes(folder.uri.scheme)) {
            const serverSummary = getServerSummary(serverName);
            if (serverSummary) {
                children.set(serverName, new ServerTreeItem(serverSummary, 'current'));
            }
        }
        const conn = vscode.workspace.getConfiguration('objectscript.conn', folder);
        const connServer = conn.get<string>('server');
        if (connServer) {
            const serverSummary = getServerSummary(connServer);
            if (serverSummary) {
                children.set(connServer, new ServerTreeItem(serverSummary, 'current'));
            }
        }
    });

    return Array.from(children.values()).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function favoriteServers(element?: SMTreeItem, params?: any): ServerTreeItem[] {
    const children: ServerTreeItem[] = [];

    favoritesMap.forEach((_, name) => {
        const serverSummary = getServerSummary(name);
        if (serverSummary) {
            children.push(new ServerTreeItem(serverSummary, 'starred'));
        }
    });

    return children.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

function recentServers(element?: SMTreeItem, params?: any): ServerTreeItem[] {
    const children: ServerTreeItem[] = [];

    recentsArray.map((name) => {
        const serverSummary = getServerSummary(name);
        if (serverSummary) {
            children.push(new ServerTreeItem(serverSummary, 'recent'));
        }
    });

    return children;
}

export class ServerTreeItem extends SMTreeItem {
    public readonly name: string;
	constructor(
		serverName: ServerName,
        parentFolderId: string
	) {
        // Wrap detail (a uri string) as a null link to prevent it from being linkified
		super({label: serverName.name, tooltip: new vscode.MarkdownString(`[${serverName.detail}]()`).appendMarkdown(serverName.description ? `\n\n*${serverName.description}*` : '')});
        this.name = serverName.name;
        //this.command = {command: 'intersystems-community.servermanager.openManagementPortalInSimpleBrowser', title: 'Open Management Portal in Simple Browser Tab', arguments: [this]};
        this.contextValue = `${parentFolderId}.server.${favoritesMap.has(this.name) ? 'starred' : ''}`;
        const color = colorsMap.get(this.name);
        this.iconPath = new vscode.ThemeIcon('server-environment', color ? new vscode.ThemeColor('charts.' + color) : undefined);
	}
}
