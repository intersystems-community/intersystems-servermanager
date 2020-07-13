import * as vscode from 'vscode';
import { ServerName, ServerSpec } from '../extension';

export function getServerNames(scope?: vscode.ConfigurationScope): ServerName[] {
    let names: ServerName[] = [];
    const servers = vscode.workspace.getConfiguration('intersystems', scope).get('servers');

    if (typeof servers === 'object' && servers) {
        const defaultName: string = servers['/default'] || '';
        if (defaultName.length > 0 && servers[defaultName]) {
            names.push({
                name: defaultName,
                description: `${servers[defaultName].description || ''} (default)`,
                detail: serverDetail(servers[defaultName])
            });
        }
        for (const key in servers) {
            if (!key.startsWith('/') && key !== defaultName) {
                names.push({
                    name: key,
                    description: servers[key].description || '',
                    detail: serverDetail(servers[key])
                });
            }
        }
    }
    return names;
}

function serverDetail(connSpec: ServerSpec): string {
    return `${connSpec.webServer.scheme || 'http'}://${connSpec.webServer.host}:${connSpec.webServer.port}/${connSpec.webServer.pathPrefix || ''}`;
}