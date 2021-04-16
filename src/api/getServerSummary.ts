import * as vscode from 'vscode';
import { ServerName, ServerSpec } from '../extension';

export function getServerSummary(name: string, scope?: vscode.ConfigurationScope): ServerName | undefined {
    const server: ServerSpec | undefined = vscode.workspace.getConfiguration('intersystems.servers', scope).get(name);
    if (!server) {
        return undefined
    }
    return {name, description: server.description || '', detail: serverDetail(server)};
}

export function serverDetail(connSpec: ServerSpec): string {
    return `${connSpec.webServer.scheme || 'http'}://${connSpec.webServer.host}:${connSpec.webServer.port}/${connSpec.webServer.pathPrefix || ''}`;
}