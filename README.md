# Bondie-Docferry

> Turn article, audio, and video links into notes — right where they belong: your Obsidian Vault.

**English** · [中文](README.zh-CN.md) — [Engineering ›](ENGINEERING.md)

[![Release](https://img.shields.io/github/v/release/fyaic/Bondie-Docferry-Obsidian-Plugin?display_name=tag&style=flat-square)](https://github.com/fyaic/Bondie-Docferry-Obsidian-Plugin/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/fyaic/Bondie-Docferry-Obsidian-Plugin/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/fyaic/Bondie-Docferry-Obsidian-Plugin/actions/workflows/ci.yml)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.11.4%2B-7c3aed?style=flat-square)](manifest.json)
[![License](https://img.shields.io/github/license/fyaic/Bondie-Docferry-Obsidian-Plugin?style=flat-square)](LICENSE)

You find something worth keeping — an article, a podcast episode, a video. Today that
means a link rotting in a chat thread or a read-later app you never reopen.

Bondie-Docferry turns that link into a real Markdown note inside your Vault. One paste,
and the content becomes something you can read, edit, link, and search — in the app you
already live in.

## One field for every link

<img src="docs/assets/android/home.png" alt="One link field on the Bondie-Docferry Home view" width="360">

**One place to start.** Paste a public DocFerry link, an article, an audio, or a video URL.

- The field tells you what it recognized and what will happen — the button becomes
  **Import** or **Create note** — before you commit.
- **Paste** pulls from your clipboard in one tap. Nothing reads your clipboard on its own.
- While it works, you see plain-language progress: *Reading the link → Preparing the
  transcript → Organizing key ideas → Writing your note.*

## From link to a note you own

Paste a video link in the morning, and by the time you sit down, this is in your Vault:

```
Bondie Docferry/
└── 2026-08-14 How I organize my research.md
```

- **Plain Markdown, nothing else.** No proprietary format, no frontmatter you didn't
  ask for. The note works in Obsidian, on GitHub, in any editor — forever.
- **You choose where notes land.** Settings offer one folder for generated notes and one
  for imports (defaults: `Bondie Docferry` and `Bondie Docferry/Imports`).
- **Preview before it's final.** Title, summary, source site, rendered content — plus the
  raw Markdown source if you want to see exactly what you're getting.
- **Save note**, **Copy note**, or go straight to creating a public link — all from the
  preview.

## Private first — sharing is always a separate choice

<img src="docs/assets/android/saved-private.png" alt="Private save completion prompt with Open note, Share, and Keep private actions" width="360">

**Private by default.** Open the note, share it, or simply keep it private.

- Every finished note is saved privately first. No public link exists unless you create one.
- When the note is ready, you choose: **Open note**, **Share**, or **Keep private**.
- Sharing asks before it acts, in plain words: *"Anyone with the link can view this
  note. Your vault and account details are not shared."*

## Share without losing control

<img src="docs/assets/android/shares.png" alt="Paginated Shares view with copy and management actions" width="360">

**Your links, your rules.** Copy, open, update, stop, or delete Share history.

- Every public link you create shows up in **Shares** with a clear status:
  *Published · Password protected · Expired · Stopped*.
- **Manage** a link: change its title, add or remove a password, set or clear an expiry date.
- **Stop** a link any time. The note stays in your Vault; the link stops working for everyone.
- Tidy up afterwards: delete the history records of stopped or expired shares without
  touching your notes.

## Built for real mobile life

Phones interrupt you — calls, app switches, dead batteries. Bondie-Docferry doesn't lose
your work.

- **Come back to finished work.** Processing happens on the service, so if you switch
  apps mid-job, the note picks up where it left off when you return (kept for 24 hours).
- **Cancel, retry, or delete.** Change your mind mid-processing? Cancel it. A note failed
  on a bad connection? Retry it. Want the temporary data gone? Delete it from
  *Account → Processing data*.
- **Flaky network tolerance.** Brief connection drops trigger an automatic reconnect with
  a status you can understand, not a dead spinner.

## Import a DocFerry note from someone else

Someone sent you a note via a public DocFerry link? You don't need to be the author to
keep it.

- Paste the share link — it imports as a note, **including its attachments**, into your
  imports folder.
- **Free, no account needed.** Share import works signed out.
- Paste the same link twice? It opens the existing note instead of duplicating it.

## Know where you stand

<img src="docs/assets/android/account.png" alt="Account view with connection, membership, and usage status" width="360">

**Useful account status.** Identity, membership, and usage without exposing keys.

- Sign in with your Bondie account; see who you're signed in as at a glance.
- Membership in plain words: **DocFerry Pro** or **Free**.
- Usage in real numbers: *"5 Media notes left · resets Sep 1"* — no guessing.
- Membership and account management live in the Bondie Account Center, one tap away.

> These four screens were captured from the release candidate running in Obsidian 1.12.7
> on a physical Android phone. Account details, usage values, and Share content were
> replaced before capture.

## Your notes stay yours

- **No lock-in.** Notes are ordinary Markdown files in folders you chose. Disable or
  uninstall the plugin — the notes are still there, still readable.
- **Your Vault is not scanned.** The plugin writes only the notes it creates or imports.
  It never reads or uploads the rest of your Vault.
- **No telemetry, no ads.** Nothing about your usage leaves the plugin client.
- **Your session is safe.** Sign-in is stored with Obsidian's own SecretStorage. AI
  provider keys and payment secrets never touch the plugin.

## Get started

1. You need Obsidian **1.11.4 or later**, on mobile or desktop.
2. **Current status: release candidate.** Bondie-Docferry is under Community plugin
   review and not yet in the official directory. The simplest path is to wait for the
   directory listing.
3. Testers and reviewers can install manually: download `main.js`, `manifest.json`, and
   `styles.css` from the [latest release](https://github.com/fyaic/Bondie-Docferry-Obsidian-Plugin/releases),
   drop them into `<vault>/.obsidian/plugins/bondie-docferry/`, restart Obsidian, and
   enable Bondie-Docferry in Community plugins.
4. Tap the **ship icon** in the ribbon (or run **Open home**), paste your first link,
   and watch it become a note.

Share import works immediately, no account. Turning articles, audio, and video into
notes requires a free Bondie account and a DocFerry Pro membership — see below.

## Good to know

**Pricing.** Importing public DocFerry shares is free and needs no account. The
Media-to-Note workflow (links → notes), owner Shares, and usage tracking require a
Bondie account with DocFerry Pro. One membership covers both Bondie-Docferry and
DocFerry — the plugin never sells a second subscription. Current pricing and billing
are shown by the Bondie Account Center and DocFerry checkout.

**Disclosures** (required for Obsidian Community plugins):

- **Payment:** `Paid`. Share import is free; Media-to-Note requires DocFerry Pro.
- **Account:** required for Media-to-Note, owner Shares, usage, and account controls.
  Public Share import works signed out.
- **Network:** submitted links and signed-in actions use hosted Bondie, SynapseHub, and
  DocFerry services. Account avatars and validated source thumbnails load over HTTPS
  from their image hosts.
- **Vault access:** the plugin writes only generated/imported notes and declared assets
  to your chosen folders. It does not scan unrelated Vault files.
- **Clipboard:** accessed only after your explicit **Paste** or **Copy** action.
- **Telemetry and ads:** none in the plugin client.
- **Source availability:** this client is MIT-licensed and public. Hosted service source
  is closed and not part of this repository.

Full details: [Privacy notice](PRIVACY.md) · [Security policy](SECURITY.md) ·
[Support & subscriptions](SUPPORT.md).

**Compatibility.** Obsidian 1.11.4+ · Android and desktop tested · no Node.js or
Electron dependency.

## Project links

[Latest release](https://github.com/fyaic/Bondie-Docferry-Obsidian-Plugin/releases/latest) ·
[Changelog](CHANGELOG.md) · [Support](SUPPORT.md) · [Contributing](CONTRIBUTING.md) ·
[Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Engineering docs](ENGINEERING.md)

## License

The public plugin client is released under the [MIT License](LICENSE). Hosted service
source is closed and is not part of this repository.
