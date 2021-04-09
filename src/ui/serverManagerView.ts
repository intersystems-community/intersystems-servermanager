import * as vscode from 'vscode';
import { getServerNames } from '../api/getServerNames';
import { ServerName } from '../extension';

export class ServerManagerView {

	constructor(context: vscode.ExtensionContext) {
        const treeDataProvider = new SMNodeProvider();
		const view = vscode.window.createTreeView('intersystems-community_servermanager', { treeDataProvider, showCollapseAll: false });
		context.subscriptions.push(view);
	}
}

export class SMNodeProvider implements vscode.TreeDataProvider<SMTreeItem> {

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
            children.push(new SMTreeItem({label: 'Current', codiconName: 'home'}));
            children.push(new SMTreeItem({label: 'Starred', codiconName: 'star'}));
            children.push(new SMTreeItem({label: 'Recent', codiconName: 'history'}));
            children.push(new SMTreeItem({label: 'All : Ordered', tooltip: 'Sequenced as found in settings.json', codiconName: 'list-ordered', getChildren: getChildrenServers, params: {sorted: false}}));
            children.push(new SMTreeItem({label: 'All : Sorted', tooltip: 'Alphabetic order', codiconName: 'triangle-down', getChildren: getChildrenServers, params: {sorted: true}}));
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
    tooltip?: string,
    description?: string,
    codiconName?: string,
    getChildren?: Function,
    params?: any
}

export class SMTreeItem extends vscode.TreeItem {

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

function getChildrenServers(element?: SMTreeItem, params?: any): SMTreeItem[] {
    const children: SMTreeItem[] = [];
    const getAllServers = (sorted?: boolean): ServerTreeItem[] => {
        let serverNames = getServerNames();
        if (sorted) {
            serverNames = serverNames.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        }
        return serverNames.map((serverName) => {
            return new ServerTreeItem(serverName);
        })
    }
    
    getAllServers(params.sorted).map((server) => children.push(server));
    return children;
}

export class ServerTreeItem extends SMTreeItem {

	constructor(
		serverName: ServerName,
	) {
		super({label: serverName.name, tooltip: serverName.description, description: serverName.detail});
        this.command = {command: 'intersystems-community.servermanager.openManagementPortalInSimpleBrowser', title: 'Open Management Portal in Simple Browser Tab', arguments: [this]};
	}
	iconPath = new vscode.ThemeIcon('server-environment');
	contextValue = 'server';
}
