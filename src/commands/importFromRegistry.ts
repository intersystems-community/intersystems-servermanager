import * as vscode from "vscode";
import { Keychain } from "../keychain";

export async function importFromRegistry(scope?: vscode.ConfigurationScope) {
  const cmd = require("node-cmd");
  const vsWinReg = require("vscode-windows-registry");
  const hkeyLocalMachine = "HKEY_LOCAL_MACHINE";

  const config = vscode.workspace.getConfiguration("intersystems", scope);
  const serverDefinitions: any = config.get("servers");

  const newServerNames = new Array<string>();
  const serversMissingUsernames = new Array<string>();
  const cancellationToken = new vscode.CancellationTokenSource().token;
  cancellationToken.onCancellationRequested(() => {
    vscode.window.showInformationMessage("Cancelled server import.");
  });

  await cmd.get(
    "reg query " +
      hkeyLocalMachine +
      "\\SOFTWARE\\Intersystems\\Cache\\Servers",
    async (err, data, stderr) => {
      // Prompt user for username (if not in registry) and password
      data.split("\n").forEach((serverName) => {
        // remove HKEY_LOCAL_MACHINE\ and whitespace from the server name
        const path = serverName.substring(hkeyLocalMachine.length + 1).trim();

        const originalName: string = serverName.split("\\").pop().trim();
        // Enforce the rules from package.json on the server name
        const name = originalName.toLowerCase().replace(/[^A-Za-z1-9-]/g, "~");
        const getProperty = (property: string) =>
          vsWinReg.GetStringRegKey(hkeyLocalMachine, path, property);

        if (name !== "" && !config.has("servers." + name)) {
          newServerNames.push(name);
          let username: string | undefined;
          try {
            username = vsWinReg.GetStringRegKey(
              "HKEY_CURRENT_USER",
              "Software\\InterSystems\\Cache\\Servers\\" + originalName,
              "Server User Name",
            );
          } catch (e) {
            // No-op; will assume the key did not exist (it is valid for it not to).
          }

          if (username === undefined || username === "") {
            serversMissingUsernames.push(name);
          }

          const usesHttps = getProperty("HTTPS") === "1";
          serverDefinitions[name] = {
            description: getProperty("Comment"),
            username: (username === undefined || username === "" ? undefined : username),
            webServer: {
              host: getProperty("Address"),
              port: parseInt(getProperty("WebServerPort"), 10),
              scheme: usesHttps ? "https" : "http",
            },
          };
        }
      });

      if (serversMissingUsernames.length) {
        let serverName = serversMissingUsernames[0];
        let username = await vscode.window.showInputBox({
          ignoreFocusOut: true,
          placeHolder: "username",
          prompt: `Username for server '${serverName}'`,
          validateInput: ((value) => {
              return value.length > 0 ? "" : "Mandatory field";
          }),
        }, cancellationToken);
        if (cancellationToken.isCancellationRequested || username === undefined) {
          return;
        }
        if (serversMissingUsernames.length > 1) {
          const items = [
            `Use username '${username}' for all servers`,
            `Enter usernames individually for ${serversMissingUsernames.length - 1} more server(s)`,
            `Cancel`].map((label) => {
              return { label };
            });
          const result = await vscode.window.showQuickPick(items, {
            canPickMany: false,
            ignoreFocusOut: true,
          }, cancellationToken);
          if (cancellationToken.isCancellationRequested || result === undefined || result.label === items[2].label) {
            return;
          } else if (result.label === items[0].label) {
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
              }, cancellationToken);
              if (cancellationToken.isCancellationRequested || username === undefined) {
                return;
              }
              serverDefinitions[serverName].username = username;
            }
          }
        }
      }

      let reusePassword;
      let password;
      for (const serverName of newServerNames) {
        if (!reusePassword) {
          password = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            password: true,
            placeHolder: "Password to store in keychain",
            prompt: `For connection to InterSystems server '${serverName}'
              as ${serverDefinitions[serverName].username}`,
            validateInput: ((value) => {
                return value.length > 0 ? "" : "Mandatory field";
            }),
          }, cancellationToken);

          if (!password) {
            return;
          }

          if (cancellationToken.isCancellationRequested) {
            return;
          }
        }

        if (reusePassword === undefined) {
          const items = [
            `Use this password for all servers`,
            `Enter passwords individually for ${newServerNames.length - 1} more server(s)`,
            `Cancel`].map((label) => {
              return { label };
            });
          const result = await vscode.window.showQuickPick(items, {
            canPickMany: false,
            ignoreFocusOut: true,
          });
          if (cancellationToken.isCancellationRequested || result === undefined || result.label === items[2].label) {
            return;
          }
          reusePassword = (result.label === items[0].label);
        }

        await new Keychain(serverName).setPassword(password).then(() => {
            vscode.window.showInformationMessage(`Password for '${serverName}' stored in keychain.`);
        });
      }

      config.update(
        `servers`,
        serverDefinitions,
        vscode.ConfigurationTarget.Global,
      );
    },
  );
}
