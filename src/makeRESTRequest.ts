// Derived from https://github.com/intersystems/language-server/blob/bdeea88d1900a3aff35d5ac373436899f3904a7e/server/src/server.ts

import axios, { AxiosResponse } from 'axios';
import axiosCookieJarSupport from 'axios-cookiejar-support';
import tough = require('tough-cookie');
import { ServerSpec } from './extension';

axiosCookieJarSupport(axios);

/**
 * Cookie jar for REST requests to InterSystems servers.
 */
let cookieJar: tough.CookieJar = new tough.CookieJar();

export interface AtelierRESTEndpoint {
    apiVersion: number,
    namespace: string,
    path: string
};

/**
 * Make a REST request to an InterSystems server.
 * 
 * @param method The REST method.
 * @param server The server to send the request to.
 * @param endpoint Optional endpoint object. If omitted the request will be to /api/atelier/
 * @param data Optional request data. Usually passed for POST requests.
 */
 export async function makeRESTRequest(method: "GET"|"POST", server: ServerSpec, endpoint?: AtelierRESTEndpoint, data?: any): Promise<AxiosResponse | undefined> {

	// Build the URL
	var url = server.webServer.scheme + "://" + server.webServer.host + ":" + String(server.webServer.port);
    const pathPrefix = server.webServer.pathPrefix;
	if (pathPrefix && pathPrefix !== "") {
		url = url.concat("/",pathPrefix)
	}
    url += "/api/atelier/";
    if (endpoint) {
        url += "/api/atelier/v" + String(endpoint.apiVersion) + "/" + endpoint.namespace + endpoint.path;
    }

	// Make the request (SASchema support removed)
	try {
        var respdata: AxiosResponse;
        if (data !== undefined) {
            // There is a data payload
            respdata = await axios.request(
                {
                    method: method,
                    url: encodeURI(url),
                    data: data,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    withCredentials: true,
                    jar: cookieJar,
                    validateStatus: function (status) {
                        return status < 500;
                    }
                }
            );
            if (respdata.status === 401) {
                // Either we had no cookies or they expired, so resend the request with basic auth

                respdata = await axios.request(
                    {
                        method: method,
                        url: url,
                        data: data,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        auth: {
                            username: server.username || "",
                            password: server.password || ""
                        },
                        withCredentials: true,
                        jar: cookieJar
                    }
                );
            }
        }
        else {
            // No data payload
            respdata = await axios.request(
                {
                    method: method,
                    url: url,
                    withCredentials: true,
                    jar: cookieJar,
                    validateStatus: function (status) {
                        return status < 500;
                    }
                }
            );
            if (respdata.status === 401) {
                // Either we had no cookies or they expired, so resend the request with basic auth

                respdata = await axios.request(
                    {
                        method: method,
                        url: url,
                        auth: {
                            username: server.username || "",
                            password: server.password || ""
                        },
                        withCredentials: true,
                        jar: cookieJar
                    }
                );
            }
        }
        return respdata;
	} catch (error) {
		console.log(error);
		return undefined;
	}
};
