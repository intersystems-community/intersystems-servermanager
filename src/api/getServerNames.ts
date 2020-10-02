import * as vscode from 'vscode';
import { ServerName, ServerSpec } from '../extension';

export function getServerNames(scope?: vscode.ConfigurationScope): ServerName[] {
    let names: ServerName[] = [];
    let defaultNames: ServerName[] = [];
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
                const inspected = vscode.workspace.getConfiguration('intersystems.servers', scope).inspect(key);

                // At least in VS Code 1.49 the defaultValue unexpectedly returns undefined
                // even for keys that are defined in package.json as defaults. So we have to check negatively all the other possibilities.
                if (!inspected?.globalLanguageValue && !inspected?.globalValue && !inspected?.workspaceFolderLanguageValue && !inspected?.workspaceFolderValue && !inspected?.workspaceLanguageValue && !inspected?.workspaceValue) {
                    defaultNames.push({
                        name: key,
                        description: servers[key].description || '',
                        detail: serverDetail(servers[key])
                    });
                } else {
                    names.push({
                        name: key,
                        description: servers[key].description || '',
                        detail: serverDetail(servers[key])
                    });
                }
            }
        }
    }
    names.push(...defaultNames);
    return names;
}

function serverDetail(connSpec: ServerSpec): string {
    return `${connSpec.webServer.scheme || 'http'}://${connSpec.webServer.host}:${connSpec.webServer.port}/${connSpec.webServer.pathPrefix || ''}`;
}