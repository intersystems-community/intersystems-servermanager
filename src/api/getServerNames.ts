import * as vscode from 'vscode';
import { ServerName, ServerSpec } from '../extension';

export function getServerNames(scope?: vscode.ConfigurationScope): ServerName[] {
    let names: ServerName[] = [];
    let defaultNames: ServerName[] = [];
    const servers = vscode.workspace.getConfiguration('intersystems', scope).get('servers');

    if (typeof servers === 'object' && servers) {
        
        // Helper function to return true iff inspected setting is not explicitly set at any level
        const notSet = (inspected):boolean => {
            return !inspected?.globalLanguageValue && !inspected?.globalValue && !inspected?.workspaceFolderLanguageValue && !inspected?.workspaceFolderValue && !inspected?.workspaceLanguageValue && !inspected?.workspaceValue;
        }
        
        // If a valid default has been explicitly nominated, add it first
        const inspectedDefault = vscode.workspace.getConfiguration('intersystems.servers', scope).inspect('/default');
        const myDefault: string = notSet(inspectedDefault) ? '' : servers['/default'] || '';
        if (myDefault.length > 0 && servers[myDefault]) {
            names.push({
                name: myDefault,
                description: `${servers[myDefault].description || ''} (default)`,
                detail: serverDetail(servers[myDefault])
            });
        }
 
        // Process the rest
        for (const key in servers) {
            if (!key.startsWith('/') && key !== myDefault) {
                const inspected = vscode.workspace.getConfiguration('intersystems.servers', scope).inspect(key);

                // Collect embedded (default~*) servers separately
                if (notSet(inspected)) {
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

    // Append the embedded servers unless suppressed
    if (!vscode.workspace.getConfiguration('intersystems.servers', scope).get('/hideEmbeddedEntries')) {
        names.push(...defaultNames);
    }
    return names;
}

function serverDetail(connSpec: ServerSpec): string {
    return `${connSpec.webServer.scheme || 'http'}://${connSpec.webServer.host}:${connSpec.webServer.port}/${connSpec.webServer.pathPrefix || ''}`;
}