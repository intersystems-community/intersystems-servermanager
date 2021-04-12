import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { getServerSpec } from './getServerSpec';

export async function getPortalUriWithCredentials(name: string, scope?: vscode.ConfigurationScope): Promise<Uri | undefined> {
    return getServerSpec(name, scope).then((spec) => {
        if (typeof spec !== 'undefined') {
            const webServer = spec.webServer;
            let queryString = '';
        
            // At this point we don't know if the target is IRIS or Cache, so add credentials in both formats.
            // Deliberately put password before username, otherwise it is visible in VS Code's confirmation dialog triggered target domain
            // hasn't been set as trusted. Likewise, deliberately put IRIS* after Cache*
            if (spec?.password) {
                const passwordEncoded = encodeURIComponent(spec.password);
                queryString += `&CachePassword=${passwordEncoded}&IRISPassword=${passwordEncoded}`;
            }
            if (spec?.username) {
                const usernameEncoded = encodeURIComponent(spec.username);
                queryString += `&CacheUsername=${usernameEncoded}&IRISUsername=${usernameEncoded}`;
            }

            // Add a dummy cache-buster and push the actual credentials offscreen
            queryString = '_=' + new Date().getTime().toString().padEnd(480,' ') + queryString;

            return vscode.Uri.parse(`${webServer.scheme}://${webServer.host}:${webServer.port}${webServer.pathPrefix}/csp/sys/UtilHome.csp?${queryString}`, true);
        }
    })
}
