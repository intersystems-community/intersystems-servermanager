// Derived from
//  https://github.com/intersystems/language-server/blob/bdeea88d1900a3aff35d5ac373436899f3904a7e/server/src/server.ts

import axios, { AxiosResponse } from "axios";
import axiosCookieJarSupport from "axios-cookiejar-support";
import * as https from "https";
import tough = require("tough-cookie");
import * as vscode from "vscode";
import { AUTHENTICATION_PROVIDER } from "./authenticationProvider";
import { IServerSpec } from "./extension";
import { getServerSpec } from "./api/getServerSpec";

axiosCookieJarSupport(axios);

export interface IServerSession {
    serverName: string;
    username: string;
    cookieJar: tough.CookieJar;
}

export const serverSessions = new Map<string, IServerSession>();

export interface IAtelierRESTEndpoint {
    apiVersion: number;
    namespace: string;
    path: string;
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
    method: "HEAD"|"GET"|"POST",
    server: IServerSpec,
    endpoint?: IAtelierRESTEndpoint,
    data?: any,
    ): Promise<AxiosResponse | undefined> {

    // Create the HTTPS agent
    const httpsAgent = new https.Agent({ rejectUnauthorized: vscode.workspace.getConfiguration("http").get("proxyStrictSSL") });

    let cookieJar = serverSessions.get(server.name)?.cookieJar;
    if (!cookieJar) {
      cookieJar =new tough.CookieJar();
    }

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

    // Make the request (SASchema support removed)
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
                    },
                    jar: cookieJar,
                    method,
                    url: encodeURI(url),
                    validateStatus: (status) => {
                        return status < 500;
                    },
                    withCredentials: true,
                },
            );
            if (respdata.status === 401) {
                // Use AuthenticationProvider to get password (and possibly username) if not supplied by caller
                await resolveCredentials(server);
                if (typeof server.username !== "undefined" && typeof server.password !== "undefined") {
                    // Either we had no cookies or they expired, so resend the request with basic auth
                    respdata = await axios.request(
                        {
                            httpsAgent,
                            auth: {
                                password: server.password,
                                username: server.username,
                            },
                            data,
                            headers: {
                                "Content-Type": "application/json",
                            },
                            jar: cookieJar,
                            method,
                            url: encodeURI(url),
                            withCredentials: true,
                        },
                    );
                }
            }
        } else {
            // No data payload
            respdata = await axios.request(
                {
                    httpsAgent,
                    jar: cookieJar,
                    method,
                    url: encodeURI(url),
                    validateStatus: (status) => {
                        return status < 500;
                    },
                    withCredentials: true,
                },
            );
            if (respdata.status === 401) {
                // Use AuthenticationProvider to get password (and possibly username) if not supplied by caller
                await resolveCredentials(server);
                if (typeof server.username !== "undefined" && typeof server.password !== "undefined") {
                    // Either we had no cookies or they expired, so resend the request with basic auth
                    respdata = await axios.request(
                        {
                            httpsAgent,
                            auth: {
                                password: server.password,
                                username: server.username,
                            },
                            jar: cookieJar,
                            method,
                            url: encodeURI(url),
                            withCredentials: true,
                        },
                    );
                }
            }
        }

        // Only store the session for a serverName the first time because subsequent requests to a server with no username defined must not lose initially-recorded username
        if (!serverSessions.get(server.name)) {
            serverSessions.set(server.name, {serverName: server.name, username: server.username || '', cookieJar})
        }
        return respdata;
    } catch (error) {
        console.log(error);
        return undefined;
    }
}

/**
 * Attempt to log out of our session on an InterSystems server.
 *
 * @param serverName The name of the server to send the request to.
 */
export async function logout(serverName: string) {

    const server = await getServerSpec(serverName, undefined, false, true);

    if (!server) {
      return;
    }

    const cookieJar = serverSessions.get(server.name)?.cookieJar;
    if (!cookieJar) {
        return;
    }

    // Create the HTTPS agent
    const httpsAgent = new https.Agent({ rejectUnauthorized: vscode.workspace.getConfiguration("http").get("proxyStrictSSL") });

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
              jar: cookieJar,
              method: "HEAD",
              url: encodeURI(url),
              validateStatus: (status) => {
                  return status < 500;
              },
              withCredentials: true,
          },
      );
  } catch (error) {
      console.log(error);
  }
}

async function resolveCredentials(serverSpec: IServerSpec) {
    // This arises if setting says to use authentication provider
    if (typeof serverSpec.password === "undefined") {
        const scopes = [serverSpec.name, (serverSpec.username || "").toLowerCase()];
        let session = await vscode.authentication.getSession(
            AUTHENTICATION_PROVIDER,
            scopes,
            { silent: true },
        );
        if (!session) {
            session = await vscode.authentication.getSession(
                AUTHENTICATION_PROVIDER,
                scopes,
                { createIfNone: true },
            );
        }
        if (session) {
            serverSpec.username = session.scopes[1] === "unknownuser" ? "" : session.scopes[1];
            serverSpec.password = session.accessToken;
        }
    }
}
