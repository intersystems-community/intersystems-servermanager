'use strict';
export const extensionId = 'intersystems-community.servermanager';

import * as vscode from 'vscode';
import { testPickServer, testPickServerWithoutCachedCredentials as testPickServerFlushingCachedCredentials, testPickServerDetailed } from './commands/testPickServer';
import { pickServer } from './api/pickServer';
import { getServerNames } from './api/getServerNames';
import { getServerSpec } from './api/getServerSpec';
import { storePassword, clearPassword } from './commands/managePasswords';

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
    description: string
}

export function activate(context: vscode.ExtensionContext) {


	// Register the commands
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.storePassword`, () => {
            storePassword();
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.clearPassword`, () => {
            clearPassword();
        })
    );

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
        async pickServer(scope?: vscode.ConfigurationScope, options: vscode.QuickPickOptions = {}): Promise<string | undefined> {
            return await pickServer(scope, options);

        },
        getServerNames(scope?: vscode.ConfigurationScope): ServerName[] {
            return getServerNames(scope);
        },

        async getServerSpec(name: string, scope?: vscode.ConfigurationScope, flushCredentialCache: boolean = false): Promise<ServerSpec | undefined> {
            return await getServerSpec(name, scope, flushCredentialCache);
        }

    };

    // 'export' public api-surface
    return api;
}

export function deactivate() {
}