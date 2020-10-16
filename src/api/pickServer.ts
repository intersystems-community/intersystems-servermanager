import * as vscode from 'vscode';
import { addServer } from './addServer';
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

    return await new Promise<string | undefined>((resolve, reject) => {
        var result:string
        var resolveOnHide = true;
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = "Choose server or use '+' to add one" ;
        quickPick.placeholder = options.placeHolder;
        quickPick.matchOnDescription = options.matchOnDescription || true;
        quickPick.matchOnDetail = options.matchOnDetail || false;
        quickPick.ignoreFocusOut = options.ignoreFocusOut || false;
        quickPick.items = qpItems;
        const btnAdd: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('add'), tooltip: 'Define New Server' }
        quickPick.buttons = [btnAdd];

        async function addAndResolve() {
            resolveOnHide = false;
            // Add a new server
            await addServer(scope)
                .then((value) => {
                    if (value) {
                        // Resolve the pickServer quickpick promise and tidy it up
                        resolve(value);
                        quickPick.hide();
                        quickPick.dispose();
                    }
                });
        }

        quickPick.onDidChangeSelection((items) => {
            result = items[0].label;
        });

        quickPick.onDidChangeValue(value => {
            if (value === '+') {
                addAndResolve();
            }
        })

        quickPick.onDidTriggerButton((button) => {
            if (button === btnAdd) {
                addAndResolve();
            }
        });

        quickPick.onDidAccept(() => {
            resolve(result);
            quickPick.hide();
            quickPick.dispose();
        });

        quickPick.onDidHide(() => {
            // flag used by addAndResolve to prevent resolve here
            if (resolveOnHide) {
                resolve(undefined);
            }
            quickPick.dispose();
        });
        
        quickPick.show();
    });
}