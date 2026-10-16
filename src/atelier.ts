import { IWebServerSpec } from "@intersystems-community/intersystems-servermanager";
import * as https from "https";
import * as vscode from "vscode";

/** The Atelier REST root of a web server, and the agent to reach it with. */
export function atelierTarget({ scheme, host, port, pathPrefix }: Required<IWebServerSpec>): { url: string, httpsAgent: https.Agent | undefined } {
	const url = `${scheme}://${host}:${port}${pathPrefix}/api/atelier/`;
	const httpsAgent = typeof https.Agent == "function" ? new https.Agent({ rejectUnauthorized: vscode.workspace.getConfiguration("http").get("proxyStrictSSL") }) : undefined;
	return { url, httpsAgent };
}
