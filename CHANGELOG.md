## 3.1.2022080801 (08-Aug-2022 pre-release)
* Add 2.0.11 changes.

## 3.1.2022062901 (29-Jun-2022 pre-release)
* Add 2.0.10 changes.

## 3.1.2022042001 (20-Apr-2022 pre-release)
* Add 2.0.8 and 2.0.9 changes.

## 3.1.2022020201 (02-Feb-2022 pre-release)
* Update vulnerable dependencies.

## 3.1.2022012701 (27-Jan-2022 pre-release)
* Update README.
* Automate pre-release publication to Marketplace.

## 3.1.2021122102 (21-Dec-2021 pre-release)
* Make username case-insensitive in authentication provider.

## 3.0.0 (27-Nov-2021 pre-release)
* Implement `intersystems-server-credentials` authentication provider.
* 
## 2.0.11 (08-Aug-2022)
* Fix hang when user presses Escape on password prompt (#154).
* Doublequote username in SQL GRANT statement recommendation (#151).

## 2.0.10 (29-Jun-2022)
* Accept self-signed certificates if `http.proxyStrictSSL` is set to `false` (#137).
* Notify when SQL GRANT will be necessary in order to display list of server-side projects (#140).
* Reuse session-cached username if server definition lacks one (#141).

## 2.0.9 (20-Apr-2022)
* Add support for server-side projects (#131). 

## 2.0.8 (28-Mar-2022)
* Update vulnerable dependencies.

## 2.0.7 (02-Feb-2022)
* Also import user-specific connections from Windows registry (#107).
* Update vulnerable dependencies.

## 2.0.6 (28-Sep-2021)
* Apply `pathPrefix` correctly (#95, #99).
* Update vulnerable dependencies.

## 2.0.5 (09-Jun-2021)
* Allow extension in untrusted workspaces (#92).

## 2.0.4 (12-May-2021)
* 'All Servers' folder contents were not sorted as documented (#87).
* Use web app token instead of passing credentials to Portal.

## 2.0.3 (28-Apr-2021)
* Only supply credentials to Portal if password came as plaintext from settings (#84).

## 2.0.2 (22-Apr-2021)
* Support <kbd>Alt</kbd> / <kbd>Option</kbd> modifier on Edit and View buttons to add workspace folder for server-side web application files.
* Add newly defined server to the 'Recent' list.
* Handle repeated use of the same Edit or View button better.
* Notify user if ObjectScript extension is missing.
* Add more information to README.

## 2.0.1 (19-Apr-2021)
* New icon for Activity Bar.
* Fix minor typo in README.

## 2.0.0 (16-Apr-2021)
* Add tree view interface.

## 1.0.5 (02-Feb-2021)
* Fix publication problem (#69).

## 1.0.4 (01-Feb-2021) - not published
* Add `/hideEmbeddedEntries` boolean to `intersystems.servers` to hide 'default~iris' etc from lists (#64).
* Make the `/default` setting work as designed.
* Fix problem that blocked release (#66).

## 1.0.3 (15-Jan-2021) - not published
* On Windows, add `Import Servers from Registry`command to import server definitions from registry (#1).
* Disallow the `'.'` character in server names (#60).

## 1.0.2 (13-Nov-2020)
* Display a notification when a new server is saved.
* Apply a validation pattern to `pathPrefix`.

## 1.0.1 (21-Oct-2020)
* Use transparent background for icon.

## 1.0.0 (19-Oct-2020)
* First production release.

## 0.9.2 (16-Oct-2020)
* Make `pickServer` API respect `ignoreFocusOut` option if passed.
* Standardize use of '&reg;' symbol in text strings.

## 0.9.1 (12-Oct-2020)
* Fix problem that blocked 0.9.0 release.

## 0.9.0 (09-Oct-2020)
* Rename the three built-in server definitions and push them to the bottom of the list.
* Only promote the `/default` server to the top of the list if explicitly set.
* Keep quickpick open when focusing elsewhere, for example to copy server details from a document.
* Prepare version number for 1.0 release.

## 0.0.7 (11-Sep-2020)
* Enhance server selector quickpick so new entries can be added User Settings.

## 0.0.6 (04-Sep-2020)
* New icon.
* Upgrade vulnerable dependency.

## 0.0.5 (21-Aug-2020)
* Add onDidChangePassword to API.
* Remove test commands, which are now provided by our `intersystems-community.vscode-extension-api-tester` extension.

## 0.0.4 (24-Jul-2020)
* Support storing passwords in local keychain.
* Add API that other extensions can use.
* Improve README.

## 0.0.3 (02-Jul-2020)
* Change publisher id to `intersystems-community`.
* Disallow uppercase in server names.
* First publication on Marketplace.

## 0.0.2 (12-Jun-2020)
* Adjust `intersystems.server` object structure after feedback.
* Constrain server names to use RFC3986 'unreserved' characters only.
* Reduce size of VSIX.

## 0.0.1 (10-Jun-2020)
* Initial version.
