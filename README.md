# InterSystems® Server Manager

This is a VS Code helper extension that helps configure connections to [InterSystems](https://www.intersystems.com/) servers in VS Code extensions such as the [ObjectScript Extension for VS Code](https://github.com/intersystems-community/vscode-objectscript).

It also enables the secure storage of passwords using the underlying operating system's native keystore.

## Configuring connections

Add server definitions to [user or workspace settings](https://code.visualstudio.com/docs/getstarted/settings) by editing JSON files.

For example:

```json
"intersystems.servers": {
	"dev": {
		"webServer": {
			"scheme": "https",
			"host": "webhost.local",
			"port": 443,
			"pathPrefix": "iris/dev"
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

## Storing passwords securely

This extension adds the command `InterSystems Server Manager: Store Password in Keychain` to the Command Palette, which offers a quickpick of defined servers, then prompts for a password to store. This facility should be used instead of the plaintext `password` property of a server's definition, which has been deprecated.

**Usage:**

1. Bring up the [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) by typing Ctrl+Shift+P (Cmd+Shift+P on Mac) or F1.
2. Start typing "Server Manager" to locate the `InterSystems Server Manager: Store Password in Keychain` command.
3. Pick a server.
4. Enter your password.

You will no longer need to supply a password when connecting to the server you selected.

## Removing a stored password

The command `InterSystems Server Manager: Clear Password from Keychain` removes a stored password.

**Usage:**

1. Bring up the [Command Palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) by typing Ctrl+Shift+P (Cmd+Shift+P on Mac) or F1.
2. Start typing "Server Manager" to locate the `InterSystems Server Manager: Clear Password from Keychain` command.
3. Pick a server.

## For Developers: Use By Other Extensions

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

Servers are usually listed in the order they are defined. The exception is that if a server name is set as the value of the `/default` property (see example above) it will be shown first in the list.

For details of the API, including result types and available parameters, review the source code of the extension's `activate` method [here](https://github.com/intersystems-community/intersystems-servermanager/blob/master/src/extension.ts).
