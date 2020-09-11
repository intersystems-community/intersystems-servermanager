import * as vscode from "vscode";
import { getServerNames } from "./getServerNames";

export async function addServer(scope?: vscode.ConfigurationScope): Promise<string | undefined> {
  const serverNames = getServerNames(scope);
  const spec = { webServer: { scheme: "", host: "", port: 0 } };
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
    })
    .then(
      async (name): Promise<string | undefined> => {
        if (name) {
          const host = await vscode.window.showInputBox({
            placeHolder: "Hostname or IP address of web server",
            validateInput: (value) => {
              return value.length ? undefined : "Required";
            },
          });
          if (host) {
            spec.webServer.host = host;
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
            });
            if (portString) {
              spec.webServer.port = +portString;
              const scheme = await vscode.window.showQuickPick(
                ["http", "https"],
                { placeHolder: "Confirm connection type, then definition will be stored in your User Settings. 'Escape' to cancel.",  }
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
                  return name;
                } catch (error) {
                  vscode.window.showErrorMessage(
                    "Failed to store server definition"
                  );
                  return undefined;
                }
              }
            }
          }
        }
      }
    );
}
