# Security Policy

## Reporting A Vulnerability

Use GitHub's private vulnerability reporting for this repository. Do not create a
public issue containing exploit details, account data, private source links, Vault
paths, tokens, cookies, payment references, or provider information.

Include the affected plugin version, platform, reproduction steps, and impact. Remove
or redact all user content and credentials. The maintainers will acknowledge a valid
report and coordinate remediation privately.

## Security Boundaries

- The plugin never receives an Auth0 client secret, SynapseHub management token,
  Stripe secret, DocFerry user session, or AI provider key.
- The hosted services use product-scoped sessions and short-lived purpose-bound grants.
- Account security and recovery are handled by SynapseHub/Auth0 Account Center.
- Billing is owned by DocFerry/SynapseHub; the plugin does not process card data.
