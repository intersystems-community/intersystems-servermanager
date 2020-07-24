import * as vscode from 'vscode';
import { getServerNames } from './getServerNames';

export async function pickServer(scope?: vscode.ConfigurationScope, options: vscode.QuickPickOptions = {}): Promise<string | undefined> {
    const names = getServerNames(scope);

    let qpItems: vscode.QuickPickItem[] = [];

    options.matchOnDescription = options?.matchOnDescription || true;
    options.placeHolder = options?.placeHolder || 'Pick an InterSystems server';
    options.canPickMany = false;

    names.forEach(element => {
        qpItems.push({label: element.name, description: element.description, detail: options?.matchOnDetail ? element.detail : undefined});
    });
    return await vscode.window.showQuickPick(qpItems, options).then(item => {
        return item ? item.label : undefined;
    });
}