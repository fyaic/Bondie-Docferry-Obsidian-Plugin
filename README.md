# Bondie-Docferry

Bondie-Docferry is a mobile-first Obsidian plugin for turning article, audio, and
video links into native notes through DocFerry Media-to-Note. It also imports public
DocFerry Shares and provides a compact, paginated view of your own Shares.

## How It Works

1. Open Bondie-Docferry from the ribbon.
2. Paste a link into the single Home field.
3. A public DocFerry Share imports directly into your configured Vault folder.
4. Other supported links use your Bondie account and DocFerry Media-to-Note.
5. A completed result is saved privately and shows a short action prompt.
6. Open the native note, keep it private, or explicitly create a public DocFerry link.

Generated and imported content is ordinary Markdown in your Vault. The plugin does
not maintain a second local library or scan unrelated Vault files.

## Installation Status

Bondie-Docferry is currently a GitHub release candidate for Obsidian Community review.
It is not yet listed in Obsidian's Community plugins directory.

Reviewers and testers can download `main.js`, `manifest.json`, and `styles.css` from a
matching GitHub release, place them in a `bondie-docferry` folder inside the test
Vault's Community plugins directory, restart Obsidian, and enable Bondie-Docferry.
Normal users should wait for the Community directory listing rather than install files
manually.

## Account And Payment

Public Share import does not require an account or payment. The primary Media-to-Note
workflow requires a Bondie account with DocFerry Pro. Owner Shares and account controls
also require sign-in.

Bondie-Docferry and DocFerry are separate products with separate sessions. They share
one DocFerry Pro membership for the same hosted capabilities. Bondie-Docferry does not
sell a second subscription. Current pricing, billing terms, and membership management
are shown by the Bondie Account Center and DocFerry checkout surfaces. The correct
Obsidian Community payment label is `Paid` because the primary workflow requires Pro.

See [SUPPORT.md](SUPPORT.md) for subscription management and entitlement recovery.

## Disclosures

- **Payment:** `Paid`. Public Share import is free; Media-to-Note requires DocFerry Pro.
- **Account:** A Bondie account is required for Media-to-Note, owner Shares, usage,
  and account controls. Public Share import works signed out.
- **Network:** Submitted links and authenticated actions use the hosted Bondie,
  SynapseHub, and DocFerry services listed below. Account avatars may be loaded from
  the HTTPS image URL supplied by the user's identity provider.
- **Vault access:** The plugin writes only generated/imported notes and their declared
  assets to user-selected folders. It does not scan unrelated Vault files.
- **Clipboard:** Clipboard reads and writes happen only after explicit Paste or Copy
  actions.
- **Telemetry and ads:** None in the plugin client.
- **Source availability:** This client is MIT-licensed and public. The hosted service
  source is closed and is not included in this repository.

## Network And Data Use

The plugin connects to `bondie-docferry.bondie.io` for product login, processing,
account state, and the DocFerry bridge; `account.bondie.io` provides hosted account
management; `docferry.bondie.io` serves public Share imports and assets. Account
avatars may be requested from the HTTPS image host supplied by the selected identity
provider, such as Google. Links sent for Media-to-Note are processed by the hosted
Bondie/DocFerry services.

The plugin reads the clipboard only after `Paste` and writes to it only after a Copy
action. It stores its opaque product session with Obsidian SecretStorage. It does not
include analytics or advertising telemetry. See [PRIVACY.md](PRIVACY.md) for the
complete data and retention disclosure.

## Compatibility

- Obsidian 1.11.4 or later
- Android and desktop tested
- `isDesktopOnly: false`; no Node.js or Electron runtime dependency

## Development

```bash
npm ci
npm run verify
npm audit --audit-level=high
```

`main.js` is built by release automation and is intentionally not committed to the
source branch.

## Release Assets

Each tagged release contains exactly the install assets expected by Obsidian:
`main.js`, `manifest.json`, and `styles.css`.

## License

The public plugin client is released under the [MIT License](LICENSE). Hosted service
source is closed and is not part of this repository.
