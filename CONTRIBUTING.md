# Contributing

Thanks for helping improve Bondie-Docferry.

## Before Opening A Change

- Keep the plugin mobile-compatible and avoid Node.js/Electron runtime APIs.
- Use Obsidian APIs for network requests, Vault writes, settings, and notices.
- Preserve the single Home link entry and native Vault ownership model.
- Never add telemetry, credentials, private URLs, account data, or server internals.
- Keep public sharing explicit and clearly disclosed.

## Validation

```bash
npm ci
npm run verify
npm audit --audit-level=high
```

Describe mobile and desktop behavior, privacy impact, and manual verification in the
pull request. Security reports belong in private vulnerability reporting, not issues.
