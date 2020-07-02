# InterSystems® Server Manager
A VS Code helper extension that contributes settings which define connections to InterSystems servers.

For example:
```json
	"intersystems.servers": {
		"my-local": {
			"webServer": {
				"scheme": "http",
				"host": "127.0.0.1",
				"port": 52773
			},
			"description": "My local IRIS instance"
		},
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
		"/default": "my-local"
	}
```

An extension XYZ needing to connect to InterSystems servers defines this extension as a dependency in its `package.json`

```json
  "extensionDependencies": [
    "intersystems-community.servermanager"
  ],
```

This helps users add server definitions to their [user or workspace settings](https://code.visualstudio.com/docs/getstarted/settings).

Extension XYZ then gets the `intersystems.servers` object and uses it as needed, for example:

```ts
const allServers = vscode.workspace.getConfiguration('intersystems').get('servers');
const mine = allServers['my-server'];
const webHost = mine.webServer.host;
```
