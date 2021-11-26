// Access the keytar native module shipped in vscode
import type * as keytarType from "keytar";
import * as vscode from "vscode";
import { extensionId } from "./extension";
import logger from "./logger";

function getKeytar(): IKeytar | undefined {
    try {
        return require("keytar");
    } catch (err) {
        console.log(err);
    }

    return undefined;
}

export interface IKeytar {
    getPassword: typeof keytarType["getPassword"];
    setPassword: typeof keytarType["setPassword"];
    deletePassword: typeof keytarType["deletePassword"];
}

export class Keychain {
    private keytar: IKeytar;
    private serviceId: string;
    private accountId: string;

    constructor(connectionName: string) {
        const keytar = getKeytar();
        if (!keytar) {
            throw new Error("System keychain unavailable");
        }

        this.keytar = keytar;
        this.serviceId = `${vscode.env.uriScheme}-${extensionId}:password`;
        this.accountId = connectionName;
    }

    public async setPassword(password: string): Promise<void> {
        try {
            return await this.keytar.setPassword(this.serviceId, this.accountId, password);
        } catch (e) {
            // Ignore
            await vscode.window.showErrorMessage(
                `Writing password to the keychain failed with error '{0}'.`,
                e.message,
            );
        }
    }

    public async getPassword(): Promise<string | null | undefined> {
        try {
            return await this.keytar.getPassword(this.serviceId, this.accountId);
        } catch (e) {
            // Ignore
            logger.error(`Getting password failed: ${e}`);
            return Promise.resolve(undefined);
        }
    }

    public async deletePassword(): Promise<boolean | undefined> {
        try {
            return await this.keytar.deletePassword(this.serviceId, this.accountId);
        } catch (e) {
            // Ignore
            logger.error(`Deleting password failed: ${e}`);
            return Promise.resolve(undefined);
        }
    }
}
