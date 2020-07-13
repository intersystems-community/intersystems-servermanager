'use strict';
export const extensionId = 'intersystems-community.servermanager';

import * as vscode from 'vscode';
import { testPickServer, testPickServerWithoutCachedCredentials as testPickServerFlushingCachedCredentials, testPickServerDetailed } from './commands/testPickServer';
import { pickServer } from './api/pickServer';
import { getServerNames } from './api/getServerNames';
import { getServerSpec } from './api/getServerSpec';

export interface ServerName {
    name: string,
    description: string,
    detail: string
}

export interface WebServerSpec {
    scheme: string,
    host: string,
    port: number,
    pathPrefix: string
}

export interface ServerSpec {
    name: string,
    webServer: WebServerSpec,
    username: string,
    password: string,
    storePassword: boolean,
    description: string
}

export function activate(context: vscode.ExtensionContext) {


	// Register the commands
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.testPickServer`, () => {
            testPickServer();
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.testPickServerFlushingCachedCredentials`, () => {
            testPickServerFlushingCachedCredentials();
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.testPickServerDetailed`, () => {
            testPickServerDetailed();
        })
    );

    let api = {
        async pickServer(scope?: vscode.ConfigurationScope, options: vscode.QuickPickOptions = {}, flushCredentialCache: boolean = false): Promise<ServerSpec | undefined> {
            return await pickServer(scope, options, flushCredentialCache);

        },
        getServerNames(scope?: vscode.ConfigurationScope): ServerName[] {
            return getServerNames(scope);
        },

        async getServerSpec(name: string, scope?: vscode.ConfigurationScope): Promise<ServerSpec | undefined> {
            return await getServerSpec(name, scope);
        }

    };

    // 'export' public api-surface
    return api;
}

export function deactivate() {
}