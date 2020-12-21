import * as vscode from "vscode";
import { Keychain } from "../keychain";

// To avoid overhead querying the registry, cache responses (each time the command is run)
const regQueryCache = new Map<string, any>();

export async function importFromRegistry(scope?: vscode.ConfigurationScope) {
  const config = vscode.workspace.getConfiguration("intersystems", scope);
  const serverDefinitions: any = config.get("servers");

  const newServerNames = new Array<string>();
  const serversMissingUsernames = new Array<string>();

  regQueryCache.clear();

  return vscode.window.withProgress({
    "location": vscode.ProgressLocation.Notification,
    "cancellable": true
  }, async (progress, cancellationToken) => {
    progress.report({message: "Loading server definitions from Windows registry..."});
    cancellationToken.onCancellationRequested(() => {
      vscode.window.showInformationMessage("Cancelled server import.");
    });

    // This forces the progress bar to actually show before the possibly long-running load of registry data
    await new Promise(resolve => setTimeout(resolve,0));

    await loadRegistryData(config, serverDefinitions, serversMissingUsernames, newServerNames);

    if (cancellationToken.isCancellationRequested) {
      return false;
    }
    return true;
  }).then(async (keepGoing) => {
    if (!keepGoing) {
      return;
    }
    if (!await promptForUsernames(serverDefinitions, serversMissingUsernames)) {
      vscode.window.showInformationMessage("Cancelled server import.");
      return;
    }
    await promptForPasswords(serverDefinitions, newServerNames);
    await config.update(`servers`, serverDefinitions, vscode.ConfigurationTarget.Global)
      .then(() => {
        return vscode.window.showInformationMessage("Server import completed.");
      }, (reason) => {
        let message = "Something went wrong importing servers.";
        if (reason instanceof Error) {
          message = reason.message;
        }
        vscode.window.showErrorMessage(message);
      });
  });
}

async function loadRegistryData(config, serverDefinitions, serversMissingUsernames, newServerNames): Promise<void> {
  const cmd = require("node-cmd");
  const hkeyLocalMachine = "HKEY_LOCAL_MACHINE";
  preloadRegistryCache(cmd, "HKEY_CURRENT_USER\\Software\\InterSystems\\Cache\\Servers");
  for (const folder of ['','\\WOW6432Node']) {
    const subFolder = "\\Intersystems\\Cache\\Servers";
    const path = hkeyLocalMachine + "\\SOFTWARE" + folder + subFolder;
    preloadRegistryCache(cmd, path);
    const regData = cmd.runSync("reg query " + path);
    regData.data.split("\r\n").forEach((serverName) => {
      // We only want folders, not keys (e.g., DefaultServer)
      if (serverName.indexOf(hkeyLocalMachine) !== 0) {
        return;
      }

      // For WOW6432Node, skip the line for the subfolder itself
      if (serverName.split(subFolder).pop().length === 0) {
        return;
      }

      // remove HKEY_LOCAL_MACHINE\ and whitespace from the server name
      const path = serverName.substring(hkeyLocalMachine.length + 1).trim();

      const originalName: string = serverName.split("\\").pop().trim();
      // Enforce the rules from package.json on the server name
      const name = originalName.toLowerCase().replace(/[^a-z0-9-._~]/g, "~");
      const getProperty = (property: string) => getStringRegKey(cmd, hkeyLocalMachine, path, property);

      if (name !== "" && !config.has("servers." + name)) {
        if (!newServerNames.includes(name)) {
          newServerNames.push(name);
        }
        const username = getStringRegKey(cmd,
          "HKEY_CURRENT_USER",
          // NOTE: this doesn't ever use WOW6432Node!
          "Software\\InterSystems\\Cache\\Servers\\" + originalName,
          "Server User Name",
        );

        if ((username === undefined) && !serversMissingUsernames.includes(name)) {
          serversMissingUsernames.push(name);
        }

        const usesHttps = getProperty("HTTPS") === "1";
        const instanceName = getProperty("WebServerInstanceName");
        serverDefinitions[name] = {
          description: getProperty("Comment"),
          username,
          webServer: {
            host: getProperty("WebServerAddress") || getProperty("Address"),
            pathPrefix: instanceName ? '/' + instanceName : undefined,
            port: parseInt(getProperty("WebServerPort") || "", 10),
            scheme: usesHttps ? "https" : "http",
          },
        }
      }
    });
  }
}

async function promptForUsernames(serverDefinitions: any, serversMissingUsernames: string[]): Promise<boolean> {
  if (serversMissingUsernames.length) {
    let serverName = serversMissingUsernames.splice(0,1)[0];
    let username = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      placeHolder: "Username",
      prompt: `Username for server '${serverName}'`,
      validateInput: ((value) => {
          return value.length > 0 ? "" : "Mandatory field";
      }),
    });
    if (username === undefined) {
      return false;
    }
    serverDefinitions[serverName].username = username;
    if (serversMissingUsernames.length > 0) {
      const items = [
        `Enter usernames individually for ${serversMissingUsernames.length} more server(s)`,
        `Use username '${username}' for all servers that don't already have a username configured`,
        `Cancel import`].map((label) => {
          return { label };
        });
      const result = await vscode.window.showQuickPick(items, {
        canPickMany: false,
        ignoreFocusOut: true
      });
      if (result === undefined || result.label === items[2].label) {
        return false;
      } else if (result.label === items[1].label) {
        for (serverName of serversMissingUsernames) {
          serverDefinitions[serverName].username = username;
        }
      } else {
        for (serverName of serversMissingUsernames) {
          username = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            prompt: `Username for server '${serverName}'`,
            validateInput: ((value) => {
                return value.length > 0 ? "" : "Mandatory field";
            }),
            value: username,
          });
          if (username === undefined) {
            return false;
          }
          serverDefinitions[serverName].username = username;
        }
      }
    }
  }
  return true;
}

async function promptForPasswords(serverDefinitions: any, newServerNames: string[]): Promise<void> {
  let reusePassword;
  let password;
  for (const serverName of newServerNames) {
    if (!reusePassword) {
      password = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        password: true,
        placeHolder: "Password to store in keychain",
        prompt: `For connection to InterSystems server '${serverName}'
          as ${serverDefinitions[serverName].username}`
      });

      if (!password) {
        return;
      }
    }

    if ((reusePassword === undefined) && (newServerNames.length > 1)) {
      const items = [
        `No`,
        `Yes`,
        `Cancel (enter passwords later)`].map((label) => {
          return { label };
        });
      const result = await vscode.window.showQuickPick(items, {
        canPickMany: false,
        ignoreFocusOut: true,
        placeHolder: `Store the same password for remaining ${newServerNames.length - 1} server(s)?`
      });
      if (result === undefined || result.label === items[2].label) {
        return;
      }
      reusePassword = (result.label === items[1].label);
    }

    if ((password !== "") && (password !== undefined)) {
      await new Keychain(serverName).setPassword(password).then(() => {
          vscode.window.showInformationMessage(`Password for '${serverName}' stored in keychain.`);
      });
    }
  }
}

function preloadRegistryCache(cmd, fullPath) {
  const regData = cmd.runSync("reg query " + fullPath + " /s");
  if (!regData.data) {
    return;
  }
  regData.data.split("\r\n\r\n").forEach(pathResult => {
    // Equivalent of running "reg query " + queryPath
    const lines = pathResult.split("\r\n");
    const queryPath = lines.splice(0,1)[0];
    const queryResult = lines.join("\r\n");
    regQueryCache.set(queryPath, { data: queryResult });
  });
}

function getStringRegKey(cmd, hive, path, key): string | undefined {
  const queryPath = hive + "\\" + path;
  const regData = regQueryCache.get(queryPath) || cmd.runSync("reg query " + queryPath);
  if (!regData.data) {
    return undefined;
  }
  regQueryCache.set(queryPath, regData);
  const results = regData.data.split("\r\n")
    // Result lines from reg query are 4-space-delimited
    .map(line => line.split('    '))
    // Registry has format [<empty>, key, type, value]
    .filter(line => line.length === 4)
    // We're only interested in the specified key
    .filter(line => line[1] === key)
    // We want the value...
    .map(line => line[3])
    // ... and we'll treat empty strings as undefined
    .filter(result => result != '');
  return results[0];
}
