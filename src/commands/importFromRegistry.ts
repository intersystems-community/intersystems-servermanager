import * as vscode from "vscode";
import { Keychain } from "../keychain";

// To avoid overhead querying the registry, cache responses (each time the command is run)
const regQueryCache = new Map<string, any>();

export async function importFromRegistry(scope?: vscode.ConfigurationScope) {
  const config = vscode.workspace.getConfiguration("intersystems", scope);
  const serverDefinitions: any = config.get("servers");

  const newServerNames = new Array<string>();
  const serversMissingUsernames = new Array<string>();

  let overwriteCount: number;

  regQueryCache.clear();

  return vscode.window.withProgress({
    cancellable: true,
    location: vscode.ProgressLocation.Notification,
  }, async (progress, cancellationToken) => {
    progress.report({message: "Loading server definitions from Windows registry..."});
    cancellationToken.onCancellationRequested(() => {
      vscode.window.showInformationMessage("Cancelled server import.");
    });

    // This forces the progress bar to actually show before the possibly long-running load of registry data
    await new Promise((resolve) => setTimeout(resolve, 0));

    overwriteCount = await loadRegistryData(config, serverDefinitions, serversMissingUsernames, newServerNames);

    if (cancellationToken.isCancellationRequested) {
      return false;
    }
    return true;
  }).then(async (keepGoing) => {
    if (!keepGoing) {
      return;
    }

    if (overwriteCount > 0) {
      if (await vscode.window.showWarningMessage(`${overwriteCount} existing definition${overwriteCount > 1 ? "s" : ""} will be overwritten. Continue?`, { modal: true }, "Yes") !== "Yes") {
        vscode.window.showInformationMessage("Cancelled server import.");
        return;
      }
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

async function loadRegistryData(
  config: vscode.WorkspaceConfiguration,
  serverDefinitions,
  serversMissingUsernames: string[],
  newServerNames: string[],
): Promise<number> {
  const cmd = require("node-cmd");
  const subFolder = "\\Intersystems\\Cache\\Servers";
  const fullPaths: string[] = [];
  fullPaths.push("HKEY_CURRENT_USER\\SOFTWARE" + subFolder);
  fullPaths.push("HKEY_LOCAL_MACHINE\\SOFTWARE" + subFolder);
  fullPaths.push("HKEY_LOCAL_MACHINE\\WOW6432Node\\SOFTWARE" + subFolder);
  const existingUserNames: string[] = [];
  let overwriteCount = 0;
  for (const fullPath of fullPaths) {
    const hive = fullPath.split("\\")[0];
    preloadRegistryCache(cmd, fullPath);
    const regData = cmd.runSync("reg query " + fullPath);
    if (regData.data === null) {
      // e.g., because the key in question isn't there
      continue;
    }
    regData.data.split("\r\n").forEach((serverName: string) => {
      // We only want folders, not keys (e.g., DefaultServer)
      if (!serverName.startsWith(hive)) {
        return;
      }
      // For WOW6432Node, skip the line for the subfolder itself
      if ((serverName.split(subFolder).pop() ?? "").length === 0) {
        return;
      }

      // remove HKEY_LOCAL_MACHINE\ and whitespace from the server name
      const path = serverName.substring(hive.length + 1).trim();

      const originalName: string = (serverName.split("\\").pop() ?? "").trim();
      // Enforce the rules from package.json on the server name
      const name = originalName.toLowerCase().replace(/[^a-z0-9-_~]/g, "~");
      if (name === "") {
        return;
      }
      const getProperty = (property: string) => getStringRegKey(cmd, hive, path, property);

      if (!config.has("servers." + name)) {
        // Ignore incomplete definition
        if (!getProperty("Address")) {
          return;
        }
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
            pathPrefix: instanceName ? "/" + instanceName : undefined,
            port: parseInt(getProperty("WebServerPort") || "", 10),
            scheme: usesHttps ? "https" : "http",
          },
        };
      } else if (!name.startsWith("/")) {
        if (!existingUserNames.includes(name)) {
          existingUserNames.push(name);
          overwriteCount++;
        }
      }
    });
  }
  return overwriteCount;
}

async function promptForUsernames(serverDefinitions: any, serversMissingUsernames: string[]): Promise<boolean> {
  if (serversMissingUsernames.length) {
    let serverName = serversMissingUsernames.splice(0, 1)[0];
    let username = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      placeHolder: "Enter a username. Leave empty to be prompted at connect time.",
      prompt: `Username for server '${serverName}'`,
    });
    if (username === undefined) {
      // Was cancelled
      return false;
    }
    if (username === "") {
      // If unspecified, actually set to undefined to leave it empty in serverDefinitions
      username = undefined;
    }
    serverDefinitions[serverName].username = username;
    if (serversMissingUsernames.length > 0) {
      const reuseMessage = (username === undefined) ? `Prompt for username at connect time for all of them` : `Use '${username}' as the username for all of them`;
      const items = [
        `Enter a username individually for each of them`,
        reuseMessage,
        `Cancel import`].map((label) => {
          return { label };
        });
      const result = await vscode.window.showQuickPick(items, {
        canPickMany: false,
        ignoreFocusOut: true,
        placeHolder: `${serversMissingUsernames.length} more servers lack a username. What do you want to do?`,
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
  let password: string | undefined = "";
  const promptServerNames = new Array();
  // Only prompt for servers with a username specified, of course.
  newServerNames.forEach((name) => {
    if (serverDefinitions[name].username !== undefined) {
      promptServerNames.push(name);
    }
  });
  for (const serverName of promptServerNames) {
    if (!reusePassword) {
      password = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        password: true,
        placeHolder: "Enter password to store in keychain. Leave empty to be prompted at connect time.",
        prompt: `Password for connection to InterSystems server '${serverName}'
          as ${serverDefinitions[serverName].username}`,
      });

      if (password === undefined) {
        return;
      }

      if (password === "") {
        password = undefined;
      }
    }

    if ((reusePassword === undefined) && (promptServerNames.length > 1)) {
      const placeHolder = (password === undefined) ? `Enter password later for remaining ${promptServerNames.length - 1} server(s)?` : `Store the same password for remaining ${promptServerNames.length - 1} server(s)?`;
      const items = [
        `No`,
        `Yes`,
        `Cancel (enter passwords later)`].map((label) => {
          return { label };
        });
      const result = await vscode.window.showQuickPick(items, {
        canPickMany: false,
        ignoreFocusOut: true,
        placeHolder,
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
  regData.data.split("\r\n\r\n").forEach((pathResult) => {
    // Equivalent of running "reg query " + queryPath
    const lines = pathResult.split("\r\n");
    const queryPath = lines.splice(0, 1)[0];
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
    .map((line) => line.split("    "))
    // Registry has format [<empty>, key, type, value]
    .filter((line) => line.length === 4)
    // We're only interested in the specified key
    .filter((line) => line[1] === key)
    // We want the value...
    .map((line) => line[3])
    // ... and we'll treat empty strings as undefined
    .filter((result) => result !== "");
  return results[0];
}
