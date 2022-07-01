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
    findCredentials: typeof keytarType["findCredentials"];
}

function serviceId(): string {
  return `${vscode.env.uriScheme}-${extensionId}:password`;
}

export class Keychain {

    private keytar: IKeytar;
    private accountId: string;

    constructor(connectionName: string) {
        const keytar = getKeytar();
        if (!keytar) {
            throw new Error("System keychain unavailable");
        }

        this.keytar = keytar;
        this.accountId = connectionName;
    }

    public async setPassword(password: string): Promise<void> {
        try {
            return await this.keytar.setPassword(serviceId(), this.accountId, password);
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
            return await this.keytar.getPassword(serviceId(), this.accountId);
        } catch (e) {
            // Ignore
            logger.error(`Getting password failed: ${e}`);
            return Promise.resolve(undefined);
        }
    }

    public async deletePassword(): Promise<boolean | undefined> {
        try {
            return await this.keytar.deletePassword(serviceId(), this.accountId);
        } catch (e) {
            // Ignore
            logger.error(`Deleting password failed: ${e}`);
            return Promise.resolve(undefined);
        }
    }

    public static async findCredentials(): Promise<{account: string; password: string}[]> {
      console.log(serviceId());
      const keytar = getKeytar();
      try {
        if (!keytar) {
            throw new Error("System keychain unavailable");
        }
        return await keytar.findCredentials(serviceId());
      } catch (e) {
          // Ignore
          logger.error(`Finding credentials failed: ${e}`);
          return Promise.resolve([]);
      }

    }
}
