# Privacy

Updated: 2026-08-12

Bondie-Docferry is a network-capable Obsidian plugin and hosted service.

## Data Used By The Plugin

- Links that you paste or type into the Home field.
- Public DocFerry Share URLs that you choose to import.
- Configured Vault folders and the notes/assets created by explicit import or
  processing actions.
- A random, non-personal installation id for product-instance registration.

The plugin does not scan your Vault, contacts, photos, or microphone. It reads the
clipboard only when you press `Paste` and writes only when you press a Copy action.
It does not include analytics or advertising telemetry.

When an account profile includes an avatar, the plugin may load that image from the
HTTPS URL supplied by the identity provider, such as Google. The provider receives a
normal image request subject to its own privacy terms. Invalid and non-HTTPS avatar
URLs are ignored.

## Local Storage

- Settings, onboarding state, configured folders, pending-task recovery, and a small
  minimized duplicate index are stored in plugin `data.json`.
- Completed external-link history retains the source origin, not its path, query, or
  fragment. A full URL may remain in a resumable request for up to 24 hours.
- Imported public Share URLs are retained locally to prevent duplicate notes.
- The opaque Bondie-Docferry session is stored with Obsidian SecretStorage.
- Saved and imported notes are ordinary user-owned Vault files.

## Hosted Processing

`bondie-docferry.bondie.io` receives product-session requests, submitted source URLs,
and a short owner-scoped task facade for mobile progress/recovery. Production
Media-to-Note runs in DocFerry, which owns source processing, generated cloud results,
provider credentials, quality, quota, and retention. DocFerry may use contracted AI
and media-processing providers for this workflow; those providers are selected and
controlled by the hosted service, not by the plugin client. Provider credentials are
never returned to the plugin.

Bondie terminal processing activity is removed after 30 days by default and can be
deleted earlier from Account > Processing data when eligible. Deleting cloud activity
does not delete a Vault note or an existing public Share.

## Public Sharing

Generated notes are first saved privately. A DocFerry Share is created only after an
explicit Share action and can be viewed by anyone who has its link. Password, expiry,
stop, and history deletion controls are available where the account capability allows.

## Product Boundaries

- SynapseHub/Auth0 owns login, profile, devices, sessions, membership, and global logout.
- Bondie-Docferry owns its product session, mobile workflow, and temporary task facade.
- DocFerry owns Media-to-Note jobs, shared quota, public Shares, and import payloads.
- Obsidian owns the host application and Vault runtime.

The products use short-lived, purpose-bound authorization grants. They do not share
user cookies or product sessions. Bondie-Docferry does not store payment-card details,
Auth0/Google subjects, provider keys, raw identity tokens, or a separate user profile.

Public Share import is free. The primary Media-to-Note workflow requires DocFerry Pro;
payment and subscription handling remain outside the plugin.

## User Controls

- Settings > Local duplicate index > Clear removes minimized local index data only.
- Account > Processing data manages temporary hosted activity.
- Shares manages owner-scoped public links.
- Account Center manages profile, privacy, devices, sessions, and global logout.

Do not put private source links, Vault paths, account details, or session values in a
public issue. Use the private security reporting path in [SECURITY.md](SECURITY.md).
