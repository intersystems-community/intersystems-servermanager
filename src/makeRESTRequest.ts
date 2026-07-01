// Derived from
//  https://github.com/intersystems/language-server/blob/bdeea88d1900a3aff35d5ac373436899f3904a7e/server/src/server.ts

import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import * as https from "https";
import * as vscode from "vscode";
import { AUTHENTICATION_PROVIDER } from "./authenticationProvider";
import { IServerSpec } from "@intersystems-community/intersystems-servermanager";
import { getServerSpec } from "./api/getServerSpec";
import { getAccountFromParts } from "./commonActivate";

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

/**
 * Make a REST request to an InterSystems server.
 *
 * @param method The REST method.
 * @param server The server to send the request to.
 * @param endpoint Optional endpoint object. If omitted the request will be to /api/atelier/
 * @param data Optional request data. Usually passed for POST requests.
 */
export async function makeRESTRequest(
	method: "HEAD" | "GET" | "POST",
	server: IServerSpec,
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


	const request: AxiosRequestConfig & { headers: {} } = {
		httpsAgent,
		headers: {},
		method,
		url: encodeURI(url),
		validateStatus: (status) => {
			return status < 500;
		},
		withCredentials: true,
	};
	if (data !== undefined) {
		request["headers"]["Content-Type"] = "application/json";
		request["data"] = data
	}

	// Make the request
	try {
		let respdata;
		// Cookie attempt
		if (cookies.length > 0) {
			request.headers["Cookie"] = cookies.join("; ")
			respdata = await axios.request(
				request,
			);
			if (respdata?.status === 401) {
				delete request.headers["Cookie"]
				respdata = undefined;
			}
		}
		// Credential attempt
		if (respdata === undefined) {
			await resolveCredentials(server);
			if (server.auth.resolved()) {
				for (const [k, v] of Object.entries(server.auth.credentials)) {
					request[k] = Object.assign({}, request[k], v)
				}
				respdata = await axios.request(request);
			} else {
				throw Error("Internal error: Credentials were not resolved")
			}
		}
		cookies = updateCookies(cookies, respdata.headers["set-cookie"] || []);
		// Only store the session for a serverName the first time because subsequent requests
		// to a server with no username defined must not lose initially-recorded username
		const session = serverSessions.get(server.name);
		if (!session) {
			serverSessions.set(server.name, { serverName: server.name, username: server.auth.username || "", cookies });
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
					Cookie: cookies.join("; "),
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

async function resolveCredentials(spec: IServerSpec): Promise<void> {
	// This arises if setting says to use authentication provider
	if (!spec.auth.resolved()) {
		const scopes = [spec.name, spec.auth.username];
		const account = getAccountFromParts(spec.name, spec.auth.username);
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
		if (session && session.accessToken) {
			const username = session.scopes[1];
			spec.auth.resolve({
				accessToken: session.accessToken,
				username: username?.toLowerCase() !== "unknownuser" ? (username || "") : "",
			})
		}
	}
	if (!spec.auth.resolved()) {
		throw new Error("Internal error: Credentials were not resolved");
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
