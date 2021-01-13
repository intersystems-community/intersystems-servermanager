'use strict';
export const extensionId = 'intersystems-community.servermanager';

import * as vscode from 'vscode';
import { pickServer } from './api/pickServer';
import { getServerNames } from './api/getServerNames';
import { getServerSpec } from './api/getServerSpec';
import { storePassword, clearPassword } from './commands/managePasswords';
import { importFromRegistry } from './commands/importFromRegistry';

export interface ServerName {
    name: string,
    description: string,
    detail: string
}

export interface WebServerSpec {
    scheme?: string,
    host: string,
    port: number,
    pathPrefix?: string
}

export interface ServerSpec {
    name: string,
    webServer: WebServerSpec,
    username?: string,
    password?: string,
    description?: string
}

export interface JSONServerSpec {
    webServer: WebServerSpec,
    username?: string,
    password?: string,
    description?: string
}

export function activate(context: vscode.ExtensionContext) {

    const _onDidChangePassword = new vscode.EventEmitter<string>();

    // Register the commands
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.storePassword`, () => {
            storePassword()
                .then((name) => {
                    if (name && name.length > 0) {
                        _onDidChangePassword.fire(name);
                    }
                });
        })
    );
	context.subscriptions.push(
		vscode.commands.registerCommand(`${extensionId}.clearPassword`, () => {
            clearPassword()
            .then((name) => {
                if (name && name.length > 0) {
                    _onDidChangePassword.fire(name);
                }
            });
        })
    );
  context.subscriptions.push(
    vscode.commands.registerCommand(`${extensionId}.importServers`, () => {
      importFromRegistry();
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
        },

        onDidChangePassword(): vscode.Event<string> {
            return _onDidChangePassword.event;
        }

    };

    // 'export' public api-surface
    return api;
}

export function deactivate() {
}
