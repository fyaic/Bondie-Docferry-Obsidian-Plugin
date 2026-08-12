# Bondie-Docferry

Bondie-Docferry is a mobile-first Obsidian plugin for turning article, audio, and
video links into native notes through DocFerry Media-to-Note. It also imports public
DocFerry Shares and provides a compact, paginated view of your own Shares.

## How It Works

1. Open Bondie-Docferry from the ribbon.
2. Paste a link into the single Home field.
3. A public DocFerry Share imports directly into your configured Vault folder.
4. Other supported links use your Bondie account and DocFerry Media-to-Note.
5. A completed result is saved privately and opened as a native note.
6. Keep it private, or explicitly create a public DocFerry link.

Generated and imported content is ordinary Markdown in your Vault. The plugin does
not maintain a second local library or scan unrelated Vault files.

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

## Network And Data Use

The plugin connects to `bondie-docferry.bondie.io` for product login, processing,
account state, and the DocFerry bridge; `account.bondie.io` provides hosted account
management; `docferry.bondie.io` serves public Share imports and assets. Links sent
for Media-to-Note are processed by the hosted Bondie/DocFerry services.

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
code is maintained separately and is not part of this repository.
