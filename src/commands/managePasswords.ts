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

interface IMigratePasswordItem extends vscode.QuickPickItem {
    serverName: string;
    userName: string;
    password: string;
};

export async function migratePasswords(secretStorage: vscode.SecretStorage): Promise<void> {
    const credentials = await Keychain.findCredentials();
    if (credentials.length === 0) {
        vscode.window.showInformationMessage('No legacy stored passwords found.');
    } else {

        // Collect only those for which server definition exists with a username
        // and no credentials yet stored in our SecretStorage
        const migratableCredentials: IMigratePasswordItem[] = [];
        (await Promise.all(
            credentials.map(async (item): Promise<IMigratePasswordItem | undefined> => {
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
                return (await secretStorage.get(credentialKey) ? undefined : {label: `${serverName} (${username})`, picked: true, serverName, userName: username, password: item.password});
            })
            ))
            .forEach((item) => {
                if (item) {
                  migratableCredentials.push(item);
                }
            });

        if (migratableCredentials.length === 0) {
            const message = 'No remaining legacy stored passwords are eligible for migration.';
            const detail = 'They are either for servers with a password already stored in the new format, or for servers whose definition does not specify a username.'
            await vscode.window.showWarningMessage(message,
                {modal: true, detail}
            );
        } else {
            const choices = await vscode.window.showQuickPick<IMigratePasswordItem>(migratableCredentials,
                {   canPickMany: true,
                    title: "Migrate Server Manager legacy stored passwords",
                    placeHolder: "Select connections whose passwords you want to migrate"
                }
            )
            if (!choices) {
                return;
            } else if (choices.length > 0) {
                await Promise.all(choices.map(async (item) => {
                    const sessionId = ServerManagerAuthenticationProvider.sessionId(item.serverName, item.userName);
                    const credentialKey = ServerManagerAuthenticationProvider.credentialKey(sessionId);
                    return secretStorage.store(credentialKey, item.password);
                }));
                vscode.window.showInformationMessage(`Migrated ${choices.length} ${choices.length > 1 ? "passwords" : "password"}.`);
            }
        }
        const detail = "Do this to tidy up your keystore once you have migrated passwords and will not be reverting to an earlier Server Manager.";
        if ((await vscode.window.showInformationMessage(`Delete all legacy stored passwords?`, {modal: true, detail}, {title: "Yes"}, {title: "No", isCloseAffordance: true}))?.title === "Yes") {
            await Promise.all(credentials.map(async (item) => {
                const keychain = new Keychain(item.account);
                return keychain.deletePassword()
            }));
            vscode.window.showInformationMessage(`Deleted ${credentials.length} ${credentials.length > 1 ? "passwords" : "password"}.`);
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
