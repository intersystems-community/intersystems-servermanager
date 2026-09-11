# Integration test fixtures

`npm test` opens [ci.code-workspace](ci.code-workspace) in a downloaded VS Code, with the released
ObjectScript extension installed alongside this one, and runs the suite in `src/test/suite` against
two IRIS containers ([iris/docker-compose.yml](iris/docker-compose.yml)):

| Container   | Port  | `/api/atelier` authentication                              |
| ----------- | ----- | ---------------------------------------------------------- |
| `iris`      | 52799 | password only; entry `ci` stores `_SYSTEM`/`SYS` in settings |
| `iris-anon` | 52798 | unauthenticated only; entry `anon` has no username          |

Both run [iris/setup/setup.sh](iris/setup/setup.sh) after IRIS starts, which also sets a 10-second
session timeout so expired-session recovery can be tested. The workspace folders connect through
those entries:

| Folder                | Mechanism                                              |
| --------------------- | ------------------------------------------------------ |
| `client-named-server` | `objectscript.conn.server` naming `ci`                 |
| `server-side`         | `isfs://ci:user/`                                      |
| `server-side-anon`    | `isfs://anon:user/`                                    |

In CI this runs from `.github/workflows/prepare-release.yml`, on PRs whose source branch starts with
`prepare-` and on manual dispatch. To run locally, with either Docker or Podman:

```sh
podman compose -f test-fixtures/iris/docker-compose.yml up -d --wait   # or: docker compose ...
npm test
podman compose -f test-fixtures/iris/docker-compose.yml down -v
```
