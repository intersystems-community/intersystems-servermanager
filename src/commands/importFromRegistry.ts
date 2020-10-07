import * as vscode from "vscode";
import { credentialCache } from "../api/getServerSpec";
import { Keychain } from "../keychain";

export async function importFromRegistry(scope?: vscode.ConfigurationScope) {
  // TODO: make sure this command doesn't appear on non-windows OSes
  const cmd = require("node-cmd");
  const vsWinReg = require("vscode-windows-registry");
  const hkeyLocalMachine = "HKEY_LOCAL_MACHINE";

  cmd.get(
    "reg query " +
      hkeyLocalMachine +
      "\\SOFTWARE\\Intersystems\\Cache\\Servers",
    (err, data, stderr) => {
      // TODO: error handling
      const config = vscode.workspace.getConfiguration("intersystems", scope);
      const serverDefinitions: any = config.get("servers");

      // convert into async loop (this doesn't seem to work)
      // and prompt user for username (if not in registry) and password
      data.split("\n").forEach(async (serverName) => {
        // remove HKEY_LOCAL_MACHINE\ and whitespace from the server name
        const path = serverName.substring(hkeyLocalMachine.length + 1).trim();

        const originalName = serverName.split("\\").pop().trim();
        // TODO: enforce the rules from package.json on the server name simply enforcing lower case right now
        const name = originalName.toLowerCase();
        const getProperty = (property: string) =>
          vsWinReg.GetStringRegKey(hkeyLocalMachine, path, property);

        if (name !== "" && !config.has("servers." + name)) {
          // Get the username for this server
          let username = vsWinReg.GetStringRegKey(
            "HKEY_CURRENT_USER",
            "Software\\InterSystems\\Cache\\Servers\\" + originalName
          );
          if (username === "") {
            username = await vscode.window.showInputBox({
              placeHolder: "username",
              prompt: "Username for " + name,
            });
          }

          // Get the password for this server (TODO: currently duplicated from managePassword.ts)
          await vscode.window
          .showInputBox({
              password: true,
              placeHolder: 'Password to store in keychain',
              prompt: `For connection to InterSystems server '${name}'`,
              validateInput: (value => {
                  return value.length > 0 ? '' : 'Mandatory field';
              }),
              ignoreFocusOut: true,
          })
          .then((password) => {
              if (password) {
                  credentialCache[name] = undefined;
                  new Keychain(name).setPassword(password).then(() => {
                      vscode.window.showInformationMessage(`Password for '${name}' stored in keychain.`);
                  });
                  // reply = name;
              }
          });

          // TODO: make sure this works when HTTPS is defined
          const usesHttps = getProperty("HTTPS") === "1";
          serverDefinitions[name] = {
            webServer: {
              scheme: usesHttps ? "https" : "http",
              host: getProperty("Address"),
              port: parseInt(getProperty("WebServerPort"), 10),
            },
            username,
            description: getProperty("Comment"),
          };
        }
      });
      config.update(
        `servers`,
        serverDefinitions,
        vscode.ConfigurationTarget.Global
      );
    }
  );
}
