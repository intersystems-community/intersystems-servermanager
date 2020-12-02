import * as vscode from "vscode";
import { JSONServerSpec } from "../extension";
import { getServerNames } from "./getServerNames";

export async function addServer(
  scope?: vscode.ConfigurationScope
): Promise<string | undefined> {
  const serverNames = getServerNames(scope);
  const spec: JSONServerSpec = { webServer: { scheme: "", host: "", port: 0 }};
  return await vscode.window
    .showInputBox({
      placeHolder: "Name of new server definition",
      validateInput: (value) => {
        if (value === "") {
          return "Required";
        }
        if (serverNames.filter((server) => server.name === value).length) {
          return "Name already exists";
        }
        if (!value.match(/^[a-z0-9-._~]+$/)) {
          return "Can only contain a-z, 0-9 and punctuation -._~";
        }
        return null;
      },
      ignoreFocusOut: true
    })
    .then(
      async (name): Promise<string | undefined> => {
        if (name) {
          const host = await vscode.window.showInputBox({
            placeHolder: "Hostname or IP address of web server",
            validateInput: (value) => {
              return value.trim().length ? undefined : "Required";
            },
            ignoreFocusOut: true
          });
          if (host) {
            spec.webServer.host = host.trim();
            const portString = await vscode.window.showInputBox({
              placeHolder: "Port of web server",
              validateInput: (value) => {
                const port = +value;
                return value.match(/\d+/) &&
                  port.toString() === value &&
                  port > 0 &&
                  port < 65536
                  ? undefined
                  : "Required, 1-65535";
              },
              ignoreFocusOut: true
            });
            if (portString) {
              spec.webServer.port = +portString;
              const username = await vscode.window.showInputBox({
                placeHolder:
                  "Username",
                prompt:
                  "Leave empty to be prompted when connecting.",
                ignoreFocusOut: true
                });
              if (typeof username !== 'undefined') {
                const usernameTrimmed = username.trim();
                if (usernameTrimmed !== "") {
                  spec.username = usernameTrimmed;
                }
                const scheme = await vscode.window.showQuickPick(
                  ["http", "https"],
                  {
                    placeHolder:
                      "Confirm connection type, then the definition will be stored in your User Settings. 'Escape' to cancel.",
                      ignoreFocusOut: true
                    }
                );
                if (scheme) {
                  spec.webServer.scheme = scheme;
                  try {
                    const config = vscode.workspace.getConfiguration(
                      "intersystems",
                      scope
                    );
                    // For simplicity we always add to the user-level (aka Global) settings
                    const servers: any =
                      config.inspect("servers")?.globalValue || {};
                    servers[name] = spec;
                    await config.update("servers", servers, true);
                    vscode.window.showInformationMessage(`Server '${name}' stored in user-level settings.`);
                    return name;
                  } catch (error) {
                    vscode.window.showErrorMessage(
                      "Failed to store server '${name}' definition."
                    );
                    return undefined;
                  }
                }
              }
            }
          }
        }
      }
    );
}
