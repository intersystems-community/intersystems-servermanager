import * as vscode from 'vscode';
import { extensionId } from '../extension';
import { Keychain } from '../keychain';
import { credentialCache } from '../api/getServerSpec';
import { getServerNames } from '../api/getServerNames';
import { ServerTreeItem } from '../ui/serverManagerView';

export async function storePassword(treeItem?: ServerTreeItem): Promise<string> {
    if (treeItem && !getServerNames().some((value) => value.name === treeItem?.label)) {
        treeItem = undefined;
    }
    const name = treeItem?.name || await commonPickServer({matchOnDetail: true});
    let reply = '';
    if (name) {
        await vscode.window
        .showInputBox({
            password: true,
            placeHolder: 'Password to store in keychain',
            prompt: `For connection to InterSystems server '${name}'`,
            validateInput: (value => {
                return value.length > 0 ? '' : 'Mandatory field';
            }),
            ignoreFocusOut: true,
        })
        .then((password) => {
            if (password) {
                filePassword(name, password).then(() => {
                    vscode.window.showInformationMessage(`Password for '${name}' stored in keychain.`);
                });
                reply = name;
            }
        })
    }
    return reply;
}

export async function filePassword(serverName: string, password: string): Promise<boolean> {
    credentialCache[serverName] = undefined;
    return new Keychain(serverName).setPassword(password).then(() => true, () => false);
}

export async function clearPassword(treeItem?: ServerTreeItem): Promise<string> {
    if (treeItem && !getServerNames().some((value) => value.name === treeItem?.label)) {
        treeItem = undefined;
    }
    let reply = '';
    const name = treeItem?.name || await commonPickServer({matchOnDetail: true});
    if (name) {
        credentialCache[name] = undefined;
        const keychain = new Keychain(name);
        if (!await keychain.getPassword()) {
            vscode.window.showWarningMessage(`No password for '${name}' found in keychain.`);          
        } else if (await keychain.deletePassword()) {
            vscode.window.showInformationMessage(`Password for '${name}' removed from keychain.`);
            reply = name;
        } else {
            vscode.window.showWarningMessage(`Failed to remove password for '${name}' from keychain.`);
        }
    }
    return reply;
}

async function commonPickServer(options?: vscode.QuickPickOptions): Promise<string | undefined> {
    // Deliberately uses its own API to illustrate how other extensions would
    const serverManagerExtension = vscode.extensions.getExtension(extensionId);
    if (!serverManagerExtension) {
        vscode.window.showErrorMessage(`Extension '${extensionId}' is not installed, or has been disabled.`)
        return;
    }
    if (!serverManagerExtension.isActive) {
        serverManagerExtension.activate();
    }
    const myApi = serverManagerExtension.exports;

    return await myApi.pickServer(undefined, options);
}