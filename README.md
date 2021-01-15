# InterSystems Server Manager

This is a VS Code helper extension for defining connections to [InterSystems&reg;](https://www.intersystems.com/) servers. These connection definitions can used by other VS Code extensions when they make connections. One example is the [ObjectScript extension](https://github.com/intersystems-community/vscode-objectscript).

In common with the rest of VS Code, Server Manager stores your connection settings in JSON files. VS Code settings are arranged in a hierarchy that you can learn more about [here](https://code.visualstudio.com/docs/getstarted/settings).

Using Server Manager you can store connection passwords in the native keystore of your workstation's operating system instead of as plaintext in JSON files.

On Windows you can run `Import Servers from Registry` from [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) to create connection entries for all connections you previously defined with the InterSystems Server Manager.

## Defining a new connection

1. Open the VS Code [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) by typing <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> on macOS) or <kbd>F1</kbd>.
2. Start typing "Server Manager" to locate `InterSystems Server Manager: Store Password in Keychain`.
3. Type the '+' character into the quickpick input field. Alternatively click the '+' button on the top right of the quickpick.
4. Complete the prompts. By the time you reach the password prompt your connection definition has already been saved in **user-level** JSON. If you prefer to enter your password whenever a VS Code extension connects via Server Manager for the first time in a session, press <kbd>Esc</kbd> here.

## Amending and removing definitions

To manage your definitions, [edit the relevant JSON file](https://code.visualstudio.com/docs/getstarted/settings). VS Code offers several routes to these files. One way is to type "json" into the Command Palette.

In this example two connections have been defined:

```json
"intersystems.servers": {
	"dev": {
		"webServer": {
			"scheme": "https",
			"host": "webhost.local",
			"port": 443,
			"pathPrefix": "/iris/dev"
		},
		"username": "alice",
		"description": "Development server serviced by central web host over HTTPS"
	},
	"my-local": {
		"webServer": {
			"scheme": "http",
			"host": "127.0.0.1",
			"port": 52773
		},
		"description": "My local IRIS instance"
	},
	"/default": "my-local"
}
```

The JSON editor offers the usual [IntelliSense](https://code.visualstudio.com/docs/editor/intellisense) as you work in this structure.

Notice how you can add a `description` property to each connection. This will be shown alongside its entry in the server quickpick.

Servers are displayed in the quickpick in the order they are defined in the JSON file. The exception is that if a server name is set as the value of the `/default` property (see example above) it will be shown first in the list.

## Removing a stored password

The command `InterSystems Server Manager: Clear Password from Keychain` removes a stored password.

**Usage:**

1. Bring up the [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) by typing Ctrl+Shift+P (Cmd+Shift+P on Mac) or F1.
2. Start typing "Server Manager" to locate the `InterSystems Server Manager: Clear Password from Keychain` command.
3. Pick a server.

## For VS Code Extension Developers: Use By Other Extensions

An extension XYZ needing to connect to InterSystems servers can define this extension as a dependency in its `package.json`

```json
  "extensionDependencies": [
    "intersystems-community.servermanager"
  ],
```

Alternatively the `activate` method of XYZ can detect if the extension is already available, then offer to install it if necessary:

```ts
  const extId = "intersystems-community.servermanager";
  let extension = vscode.extensions.getExtension(extId);
  if (!extension) {
	// Optionally ask user for permission
	// ...

	await vscode.commands.executeCommand("workbench.extensions.installExtension", extId);
	extension = vscode.extensions.getExtension(extId);
  }
  if (!extension.isActive) {
    await extension.activate();
  }
```

XYZ can then use the extension's API to obtain the properties of a named server definition, including the password from the keychain if present:

```ts
  const serverManagerApi = extension.exports;
  if (serverManagerApi && serverManagerApi.getServerSpec) { // defensive coding
	const serverSpec = await serverManagerApi.getServerSpec(serverName);
  }
```

If the `username` property is absent it will be prompted for. If no `password` is stored in the keychain or in the JSON definition the user will be asked to provide this the first time in any session that `getServerSpec` is called for a given server.

To offer the user a quickpick of servers:

```ts
  const serverName = await serverManagerApi.pickServer();
```

To obtain an array of server names:

```ts
  const allServerNames = await serverManagerApi.getServerNames();
```
For details of the API, including result types and available parameters, review the source code of the extension's `activate` method [here](https://github.com/intersystems-community/intersystems-servermanager/blob/master/src/extension.ts).
