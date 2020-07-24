import * as vscode from 'vscode';
import { extensionId } from '../extension';
import { Keychain } from '../keychain';
import { credentialCache } from '../api/getServerSpec';

export async function storePassword() {
    const name = await commonPickServer({matchOnDetail: true});
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
                credentialCache[name] = undefined;
                new Keychain(name).setPassword(password).then(() => {
                    vscode.window.showInformationMessage(`Password for '${name}' stored in keychain.`);
                });
            }
        })
     
    }
}

export async function clearPassword() {
    const name = await commonPickServer({matchOnDetail: true});
    if (name) {
        credentialCache[name] = undefined;
        const keychain = new Keychain(name);
        if (!await keychain.getPassword()) {
            vscode.window.showWarningMessage(`No password for '${name}' found in keychain.`);          
        } else if (await keychain.deletePassword()) {
            vscode.window.showInformationMessage(`Password for '${name}' removed from keychain.`);
        } else {
            vscode.window.showWarningMessage(`Failed to remove password for '${name}' from keychain.`);
        }
    }
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