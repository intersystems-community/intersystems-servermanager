import * as vscode from "vscode";
import { getServerNames } from "../api/getServerNames";
import { credentialCache } from "../api/getServerSpec";
import { ServerManagerAuthenticationProvider } from "../authenticationProvider";
import { extensionId } from "../extension";
import { Keychain } from "../keychain";
import { ServerTreeItem } from "../ui/serverManagerView";

export async function storePassword(treeItem?: ServerTreeItem): Promise<string> {
    if (treeItem && !getServerNames().some((value) => value.name === treeItem?.label)) {
        treeItem = undefined;
    }
    const name = treeItem?.name || await commonPickServer({matchOnDetail: true});
    let reply = "";
    if (name) {
        await vscode.window
        .showInputBox({
            ignoreFocusOut: true,
            password: true,
            placeHolder: "Password to store in keychain",
            prompt: `For connection to InterSystems server '${name}'`,
            validateInput: ((value) => {
                return value.length > 0 ? "" : "Mandatory field";
            }),
        })
        .then((password) => {
            if (password) {
                filePassword(name, password).then(() => {
                    vscode.window.showInformationMessage(`Password for '${name}' stored in keychain.`);
                });
                reply = name;
            }
        });
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
    let reply = "";
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

export async function migratePasswords(secretStorage: vscode.SecretStorage): Promise<void> {
    const credentials = await Keychain.findCredentials();
    console.log(credentials);
    if (credentials.length === 0) {
        vscode.window.showInformationMessage('No legacy passwords found');
    } else {

        // Collect only those for which server definition exists with a username
        // and no credentials yet stored in our SecretStorage
        const migratableCredentials = (await Promise.all(
            credentials.map(async (item) => {
                const serverName = item.account;
                const username: string | undefined = vscode.workspace.getConfiguration("intersystems.servers." + serverName).get("username");
                if (!username) {
                  return undefined;
                }
                if (username === "" || username === "UnknownUser") {
                  return undefined;
                }
                const sessionId = ServerManagerAuthenticationProvider.sessionId(serverName, username);
                const credentialKey = ServerManagerAuthenticationProvider.credentialKey(sessionId);
                return (await secretStorage.get(credentialKey) ? {...item, username} : undefined);
            })
            ))
            .filter((item) => item);
        if (migratableCredentials.length === 0) {
            vscode.window.showInformationMessage('No legacy passwords found for servers whose definitions specify a username');
        } else {
            const disqualified = credentials.length - migratableCredentials.length;
            const detail = disqualified > 0 ? `${disqualified} other ${disqualified > 1 ? "passwords" : "password"} ignored because associated server is no longer defined, or has no username set, or already has a password in the new keystore.` : "";
            const message = `Migrate ${migratableCredentials.length} legacy stored ${migratableCredentials.length > 1 ? "passwords" : "password"}?`;
            switch (await vscode.window.showInformationMessage(message, {modal: true, detail}, "Yes", "No")) {
                case undefined:
                    return;

                case "Yes":
                    vscode.window.showInformationMessage('TODO migration');
                    break;

                default:
                    break;
            }
        }
        const detail = "Do this to tidy up your keystore once you have migrated passwords and will not be reverting to an earlier Server Manager.";
        if (await vscode.window.showInformationMessage(`Delete all legacy stored passwords?`, {modal: true, detail}, "Yes", "No") === "Yes") {
            vscode.window.showInformationMessage('TODO deletion');
        }
}
    return;
}

async function commonPickServer(options?: vscode.QuickPickOptions): Promise<string | undefined> {
    // Deliberately uses its own API to illustrate how other extensions would
    const serverManagerExtension = vscode.extensions.getExtension(extensionId);
    if (!serverManagerExtension) {
        vscode.window.showErrorMessage(`Extension '${extensionId}' is not installed, or has been disabled.`);
        return;
    }
    if (!serverManagerExtension.isActive) {
        serverManagerExtension.activate();
    }
    const myApi = serverManagerExtension.exports;

    return await myApi.pickServer(undefined, options);
}
