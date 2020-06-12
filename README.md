# InterSystems® Server Manager
A VS Code helper extension that contributes settings which define connections to InterSystems servers.

For example:
```json
	"intersystems.servers": {
		"myLocal": {
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
		"/default": "myLocal"
	}
```
