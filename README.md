# InterSystems® Server Manager
A VS Code helper extension that contributes settings to define connections to InterSystems servers.

For example:
```json
	"intersystems.servers": {
		"myLocal": {
			"webServer": {
				"host": "127.0.0.1",
				"port": 52773,
				"scheme": "http"
			},
			"comment": "My local IRIS instance"
		},
		"dev": {
			"webServer": {
				"host": "devhost.myorg",
				"port": 52773,
				"scheme": "http"
			},
			"comment": "Shared development server"
		},
		"/default": "myLocal"
	}
```
