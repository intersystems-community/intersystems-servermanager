import * as vscode from 'vscode';
import { ServerSpec } from '../extension';
import { getServerNames } from './getServerNames';
import { getServerSpec } from './getServerSpec';

export async function pickServer(scope?: vscode.ConfigurationScope, options: vscode.QuickPickOptions = {}, flushCredentialCache: boolean = false): Promise<ServerSpec | undefined> {
    const names = getServerNames(scope);

    let qpItems: vscode.QuickPickItem[] = [];

    options.matchOnDescription = options?.matchOnDescription || true;
    options.placeHolder = options?.placeHolder || 'Pick an InterSystems server';
    options.canPickMany = false;

    names.forEach(element => {
        qpItems.push({label: element.name, description: element.description, detail: options?.matchOnDetail ? element.detail : undefined});
    });
    return await vscode.window.showQuickPick(qpItems, options).then(item => {
        if (item) {
            const name = item.label;
            return getServerSpec(name, scope, flushCredentialCache).then(connSpec => {
                if (connSpec) {
                    connSpec.name = name;
                }
                return connSpec;
            });
        }
    })
}