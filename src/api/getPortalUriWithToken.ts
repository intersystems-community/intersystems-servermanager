import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { extensionId, ServerSpec } from '../extension';
import { makeRESTRequest } from '../makeRESTRequest';

const allTokens = new Map<string, string>();

export async function getPortalUriWithToken(name: string, scope?: vscode.ConfigurationScope): Promise<Uri | undefined> {

    const PORTAL_HOME = '/csp/sys/UtilHome.csp';

    // Use our own API so that the Recent folder updates with our activity
    const myApi = vscode.extensions.getExtension(extensionId)?.exports;

    const spec: ServerSpec | undefined = await myApi.getServerSpec(name, scope);
    if (typeof spec !== 'undefined') {

        // Retrieve previously cached token
        let token = allTokens.get(name) || '';

        // Revalidate and extend existing token, or obtain a new one
        const response = await makeRESTRequest("POST", spec, { apiVersion: 1, namespace: '%SYS', path:'/action/query' }, { query: 'select %Atelier_v1_Utils.General_GetCSPToken(?, ?) token', parameters: [PORTAL_HOME, token]});

        if (!response) {
            // User will have to enter credentials
            token = '';
            allTokens.delete(name);
        }
        else {
            token  = response.data?.result?.content[0]?.token || '';
            allTokens.set(name, token);
        }

        const webServer = spec.webServer;
        let queryString = token ? `CSPCHD=${encodeURIComponent(token)}` : '';

        return vscode.Uri.parse(`${webServer.scheme}://${webServer.host}:${webServer.port}${webServer.pathPrefix}${PORTAL_HOME}?${queryString}`, true);
    }
}
