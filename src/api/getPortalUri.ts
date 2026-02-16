import * as vscode from "vscode";
import { Uri } from "vscode";
import { IServerSpec } from "@intersystems-community/intersystems-servermanager";
import { extensionId } from "../commonActivate";

export async function getPortalUri(
	name: string,
	page = "/csp/sys/UtilHome.csp",
	namespace = "%SYS",
	scope?: vscode.ConfigurationScope,
): Promise<Uri | undefined> {

	// Use our own API so that the Recent folder updates with our activity
	const myApi = vscode.extensions.getExtension(extensionId)?.exports;

	const spec: IServerSpec | undefined = await myApi.getServerSpec(name, scope);
	if (typeof spec !== "undefined") {

		const webServer = spec.webServer;
		const queryString = `$NAMESPACE=${encodeURIComponent(namespace)}`;

		return vscode.Uri.parse(`${webServer.scheme}://${webServer.host}:${webServer.port}${webServer.pathPrefix}${page}?${queryString}`, true);
	}
}
