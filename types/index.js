"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasicAuthorization = exports.AUTHENTICATION_PROVIDER = exports.EXTENSION_ID = void 0;
exports.EXTENSION_ID = 'intersystems-community.servermanager';
exports.AUTHENTICATION_PROVIDER = 'intersystems-server-credentials';
function base64(text) {
    let binary = "";
    for (const byte of new TextEncoder().encode(text)) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}
/** Username/password authorization. Shared by Server Manager and client extensions so that all treat credentials alike. */
class BasicAuthorization {
    #username;
    #password;
    constructor(username, password) {
        this.#username = username;
        this.#password = password;
    }
    /** Whether `username` requests unauthenticated access (case-insensitive "UnknownUser"). */
    static isUnknownUser(username) {
        return username?.toLowerCase() === "unknownuser";
    }
    get username() {
        return this.#username || "";
    }
    get password() {
        return this.#password;
    }
    /** Empty for UnknownUser, since unauthenticated access has no credential. */
    get accessToken() {
        return BasicAuthorization.isUnknownUser(this.#username) ? "" : this.#password;
    }
    /** Empty for UnknownUser; clients must not send an empty header. */
    get httpAuthorizationHeader() {
        if (this.resolved()) {
            if (BasicAuthorization.isUnknownUser(this.#username)) {
                return "";
            }
            return `Basic ${base64(`${this.#username}:${this.#password}`)}`;
        }
    }
    resolved() {
        return BasicAuthorization.isUnknownUser(this.#username) || (this.username !== "" && !!this.#password);
    }
    resolve({ accessToken, username }) {
        this.#username = username ?? this.#username;
        // empty accessTokens are ignored.
        this.#password = accessToken || this.#password;
        return this.resolved();
    }
    clear() {
        this.#password = undefined;
    }
    get credentials() {
        if (BasicAuthorization.isUnknownUser(this.#username)) {
            return {};
        }
        else {
            return {
                auth: {
                    username: this.username,
                    password: this.password || "",
                },
                headers: {},
            };
        }
    }
    clone() {
        return new BasicAuthorization(this.#username, this.#password);
    }
}
exports.BasicAuthorization = BasicAuthorization;
