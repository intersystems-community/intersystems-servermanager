import * as vscode from "vscode";
import { Uri } from "vscode";
import { IServerSpec } from "@intersystems-community/intersystems-servermanager";
import { extensionId } from "../extension";
import { makeRESTRequest } from "../makeRESTRequest";

export enum BrowserTarget {
	SIMPLE = 0,
	EXTERNAL = 1,
}

const allTokens = [new Map<string, string>(), new Map<string, string>()];

const simpleBrowserCompatible = new Map<string, boolean>();

export async function getPortalUriWithToken(
	target: BrowserTarget,
	name: string,
	page = "/csp/sys/UtilHome.csp",
	namespace = "%SYS",
	scope?: vscode.ConfigurationScope,
): Promise<Uri | undefined> {

	// Use our own API so that the Recent folder updates with our activity
	const myApi = vscode.extensions.getExtension(extensionId)?.exports;

	const spec: IServerSpec | undefined = await myApi.getServerSpec(name, scope);
	if (typeof spec !== "undefined") {

		if (target === BrowserTarget.SIMPLE && !simpleBrowserCompatible.has(name)) {
			// Check that the portal webapps have all been altered so they don't require session cookie support, which Simple Browser cannot provide
			const response = await makeRESTRequest(
				"POST",
				spec,
				{ apiVersion: 1, namespace: "%SYS", path: "/action/query" },
				{
					query:
						"SELECT Name FROM Security.Applications WHERE {fn CONCAT(Name, '/')} %STARTSWITH '/csp/sys/' AND UseCookies = 2 " +
						"UNION SELECT $PIECE($PIECE($PIECE($ZVERSION,') ',2),' '),'.') AS Name"
				},
			);
			if (response) {
				const appsRequiringCookie = (response.data?.result?.content as any[]).map((row) => {
					return row.Name as string;
				});
				if (appsRequiringCookie.length && parseInt(appsRequiringCookie[appsRequiringCookie.length - 1], 10) >= 2024) {
					// SMP in 2024.1+ can't be embedded in a cross-origin iframe
					vscode.window.showWarningMessage(`The Portal cannot be opened in the Simple Browser for IRIS versions 2024.1+.`, "Dismiss");
					simpleBrowserCompatible.set(name, false);
				}
				else if (appsRequiringCookie.length > 1) {
					vscode.window.showWarningMessage(`Portal web apps cannot be used in the Simple Browser tab if their 'UseCookies' property is set to 'Always' (the default). To resolve this, use Portal's security section to change it to 'Autodetect' in these apps: ${appsRequiringCookie.slice(0, -1).join(", ")}`, { modal: true });
				}
				else {
					simpleBrowserCompatible.set(name, true);
				}
			}
			else {
				vscode.window.showWarningMessage(`Unable to check the Portal web apps for compatibility with Simple Browser.`, "Dismiss");
			}
			if (!simpleBrowserCompatible.get(name)) return;
		}

		if (target === BrowserTarget.SIMPLE && simpleBrowserCompatible.has(name) && !simpleBrowserCompatible.get(name)) {
			vscode.window.showWarningMessage(`The Portal cannot be opened in the Simple Browser for IRIS versions 2024.1+.`, "Dismiss");
			return;
		}

		// Retrieve previously cached token
		let token = allTokens[target].get(name) || "";

		// Revalidate and extend existing token, or obtain a new one
		const response = await makeRESTRequest(
			"POST",
			spec,
			{ apiVersion: 1, namespace, path: "/action/query" },
			{ query: "select %Atelier_v1_Utils.General_GetCSPToken(?, ?) token", parameters: [page, token] },
		);

		if (!response) {
			// User will have to enter credentials
			token = "";
			allTokens[target].delete(name);
		} else {
			token = response.data?.result?.content[0]?.token || "";
			allTokens[target].set(name, token);
		}

		const webServer = spec.webServer;
		const queryString = `$NAMESPACE=${encodeURIComponent(namespace)}${token ? `&CSPCHD=${encodeURIComponent(token)}` : ""}`;

		return vscode.Uri.parse(`${webServer.scheme}://${webServer.host}:${webServer.port}${webServer.pathPrefix}${page}?${queryString}`, true);
	}
}
