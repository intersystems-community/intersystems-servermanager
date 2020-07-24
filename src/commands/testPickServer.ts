import * as vscode from 'vscode';
import { extensionId, ServerSpec } from '../extension';

export async function testPickServer() {
    await commonTestPickServer();
}

export async function testPickServerWithoutCachedCredentials() {
    await commonTestPickServer(undefined, true);
}

export async function testPickServerDetailed() {
    await commonTestPickServer({matchOnDetail: true});
}

async function commonTestPickServer(options?: vscode.QuickPickOptions, flushCredentialCache: boolean = false) {
    // Deliberately uses its own API in the same way as other extensions would
    const serverManagerExtension = vscode.extensions.getExtension(extensionId);
    if (!serverManagerExtension) {
        vscode.window.showErrorMessage(`Extension '${extensionId}' is not installed, or has been disabled.`)
        return
    }
    if (!serverManagerExtension.isActive) {
        serverManagerExtension.activate();
    }
    const myApi = serverManagerExtension.exports;

    const name: string = await myApi.pickServer(undefined, options);
    if (name) {
        const connSpec: ServerSpec = await myApi.getServerSpec(name, undefined, flushCredentialCache);
        if (connSpec) {
            vscode.window.showInformationMessage(`Picked server '${connSpec.name}' at ${connSpec.webServer.scheme}://${connSpec.webServer.host}:${connSpec.webServer.port}/${connSpec.webServer.pathPrefix} ${!connSpec.username ? 'with unauthenticated access' : 'as user ' + connSpec.username }.`, 'OK');
        }
    }
}