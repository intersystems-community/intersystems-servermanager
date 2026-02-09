import * as vscode from "vscode";
import { Uri } from "vscode";
import { IServerSpec } from "@intersystems-community/intersystems-servermanager";
import { extensionId } from "../commonActivate";
import { makeRESTRequest } from "../makeRESTRequest";

export enum BrowserTarget {
	EXTERNAL = 1,
	INTEGRATED = 2,
}

const allTokens = [new Map<string, string>(), new Map<string, string>(), new Map<string, string>()];

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


		// Retrieve previously cached token
		let token = allTokens[target].get(name) || "";

		// Revalidate and extend existing token, or obtain a new one
		const response = await makeRESTRequest(
			"POST",
			spec,
			{ apiVersion: 1, namespace, path: "/action/query" },
			{ query: "select %Atelier_v1_Utils.General_GetCSPToken(?, ?) token", parameters: [page, token] },
		).catch(() => { /* Swallow errors */ });

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
