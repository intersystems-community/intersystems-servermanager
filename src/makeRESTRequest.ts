// Derived from
//  https://github.com/intersystems/language-server/blob/bdeea88d1900a3aff35d5ac373436899f3904a7e/server/src/server.ts

import axios, { AxiosResponse } from "axios";
import * as https from "https";
import * as vscode from "vscode";
import { getServerSpec } from "./api/getServerSpec";
import { AUTHENTICATION_PROVIDER } from "./authenticationProvider";
import { getAccountFromParts } from "./commonActivate";
import { Authorization, IServerSpec, ResolvedAuthorization } from "@intersystems-community/intersystems-servermanager";

export interface IServerSession {
	serverName: string;
	username: string;
	cookies: string[];
}

export const serverSessions = new Map<string, IServerSession>();

export interface IAtelierRESTEndpoint {
	apiVersion: number;
	namespace: string;
	path: string;
}

function updateCookies(oldCookies: string[], newCookies: string[]): string[] {
	newCookies.forEach((cookie) => {
		const [cookieName] = cookie.split("=");
		const index = oldCookies.findIndex((el) => el.startsWith(cookieName));
		if (index >= 0) {
			oldCookies[index] = cookie;
		} else {
			oldCookies.push(cookie);
		}
	});
	return oldCookies;
}

function getCookies(server: IServerSpec): string[] {
	return serverSessions.get(server.name)?.cookies ?? [];
}
interface Credentials {
	headers?: Record<string, string>;
	auth?: {
		password: string,
		username: string,
	};
};

/**
 * Make a REST request to an InterSystems server.
 *
 * @param method The REST method.
 * @param server The server setting to send the request to (internal type with OAuth2 config).
 * @param endpoint Optional endpoint object. If omitted the request will be to /api/atelier/
 * @param data Optional request data. Usually passed for POST requests.
 */
export async function makeRESTRequest(
	method: "HEAD" | "GET" | "POST",
	server: IServerSpec & { authorization: ResolvedAuthorization },
	endpoint?: IAtelierRESTEndpoint,
	data?: any,
): Promise<AxiosResponse> {

	// Create the HTTPS agent if in a node environment
	const httpsAgent = typeof https.Agent == "function" ? new https.Agent({ rejectUnauthorized: vscode.workspace.getConfiguration("http").get("proxyStrictSSL") }) : undefined;

	// Get the cookies
	let cookies: string[] = getCookies(server);

	// Build the URL
	let url = server.webServer.scheme + "://" + server.webServer.host + ":" + String(server.webServer.port);
	const pathPrefix = server.webServer.pathPrefix;
	if (pathPrefix && pathPrefix !== "") {
		url += pathPrefix;
	}
	url += "/api/atelier/";
	if (endpoint) {
		url += "v" + String(endpoint.apiVersion) + "/" + endpoint.namespace + endpoint.path;
	}

	// Make the request
	try {
		let respdata: AxiosResponse;
		if (data !== undefined) {
			// There is a data payload
			respdata = await axios.request(
				{
					httpsAgent,
					data,
					headers: {
						"Content-Type": "application/json",
						"Cookie": cookies.join(" "),
					},
					method,
					url: encodeURI(url),
					validateStatus: (status) => {
						return status < 500;
					},
					withCredentials: true,
				},
			);
			if (respdata.status === 401) {
				const credentials = await resolveCredentials(server) ?? {};
				// There is a payload so we need to add content-type
				credentials["headers"] = {
					"Content-Type": "application/json",
					...credentials["headers"],
				};
				respdata = await axios.request(
					{
						httpsAgent,
						data,
						method,
						url: encodeURI(url),
						withCredentials: true,
						...credentials,
					},
				);
			}
		} else {
			// No data payload
			respdata = await axios.request(
				{
					httpsAgent,
					method,
					headers: {
						Cookie: cookies.join(" "),
					},
					url: encodeURI(url),
					validateStatus: (status) => {
						return status < 500;
					},
					withCredentials: true,
				},
			);
			if (respdata.status === 401) {
				const credentials = await resolveCredentials(server) ?? {};
				respdata = await axios.request(
					{
						httpsAgent,
						method,
						url: encodeURI(url),
						withCredentials: true,
						...credentials,
					},
				);
			}
		}

		const authorization = server.authorization;
		cookies = updateCookies(cookies, respdata.headers["set-cookie"] || []);

		// Only store the session for a serverName the first time because subsequent requests
		// to a server with no username defined must not lose initially-recorded username
		const session = serverSessions.get(server.name);
		if (!session) {
			serverSessions.set(server.name, { serverName: server.name, username: authorization.username || "", cookies });
		} else {
			serverSessions.set(server.name, { ...session, cookies });
		}
		return respdata;
	} catch (error) {
		// Stringify and re-throw error
		throw stringifyError(error);
	}
}

/**
 * Attempt to log out of our session on an InterSystems server.
 *
 * @param serverName The name of the server to send the request to.
 */
export async function logout(serverName: string) {

	const server = await getServerSpec(serverName, undefined);

	if (!server) {
		return;
	}

	// Create the HTTPS agent if in a node environment
	const httpsAgent = typeof https.Agent == "function" ? new https.Agent({ rejectUnauthorized: vscode.workspace.getConfiguration("http").get("proxyStrictSSL") }) : undefined;

	// Get the cookies
	const cookies: string[] = getCookies(server);

	// Build the URL
	let url = server.webServer.scheme + "://" + server.webServer.host + ":" + String(server.webServer.port);
	const pathPrefix = server.webServer.pathPrefix;
	if (pathPrefix && pathPrefix !== "") {
		url += pathPrefix;
	}
	url += "/api/atelier/?CacheLogout=end";

	// Make the request but don't do anything with the response or any errors
	try {
		await axios.request(
			{
				httpsAgent,
				method: "HEAD",
				headers: {
					Cookie: cookies.join(" "),
				},
				url: encodeURI(url),
				validateStatus: (status) => {
					return status < 500;
				},
				withCredentials: true,
			},
		);
	} catch { }
}

async function resolveCredentials(spec: IServerSpec & { authorization: ResolvedAuthorization }): Promise<Credentials | undefined> {
	// Use authentication provider to get credentials when not already available
	const authorization: Authorization = spec.authorization;
	if (!authorization.resolved()) {
		const scopes = [spec.name, authorization.username];
		const account = getAccountFromParts(spec.name, authorization.username);
		let session = await vscode.authentication.getSession(
			AUTHENTICATION_PROVIDER,
			scopes,
			{ silent: true, account },
		);
		if (!session) {
			session = await vscode.authentication.getSession(
				AUTHENTICATION_PROVIDER,
				scopes,
				{ createIfNone: true, account },
			);
		}
		if (session) {
			authorization.resolve(
				session.accessToken,
				session.scopes[1].toLowerCase() === "unknownuser" ? "" : session.scopes[1],
			)
		}
	}
	if (authorization.resolved()) {
		return authorization.credentials
	} else {
		return;
	}
}

/**
 * Return a string representation of `error`.
 * If `error` is `undefined`, returns the empty string.
 * Borrowed from `vscode-objectscript:/src/utils/index.ts`
 */
function stringifyError(error): string {
	try {
		if (Array.isArray(error?.errors)) {
			// Need to stringify the inner errors of an AggregateError
			const errs = error.errors.map(stringifyError).filter((s) => s != "");
			return errs.length ? `AggregateError:\n- ${errs.join("\n- ")}` : "";
		}
		return (
			error == undefined
				? ""
				: typeof error == "string"
					? error
					: error instanceof Error
						? error.toString()
						: JSON.stringify(error)
		).trim();
	} catch {
		// Need to catch errors from JSON.stringify()
		return "";
	}
}
