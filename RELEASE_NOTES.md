# MediaFerry 0.1.3

This patch unifies the plugin identity as MediaFerry.

The manifest id is now `mediaferry`, matching the repository name as required for
Obsidian Community review, and the display name is now MediaFerry. User-facing
strings and default note folders follow the same branding. Server and storage
contract keys are unchanged, so accounts and entitlements from earlier builds
remain valid.

Manual installs from 0.1.2 or earlier should re-install from this release into
`<vault>/.obsidian/plugins/mediaferry/` and remove any previous `bondie-docferry`
plugin folder to avoid duplicate entries.

This is the current candidate for Obsidian Community review. Catalog submission is
handled separately by the product team.

Install assets: `main.js`, `manifest.json`, and `styles.css`.
