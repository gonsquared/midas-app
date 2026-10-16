# Security Policy

## Supported versions

Midas is in early development and has no released versions yet. Security fixes are applied to the `master` branch only.

## Reporting a vulnerability

Please **do not** report security vulnerabilities through public GitHub issues, pull requests or discussions.

Report them privately using GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe the issue, the affected area, steps to reproduce and any proof of concept.

If private vulnerability reporting is unavailable to you, open a blank public issue that says only that you have a security report and asks for a private channel. Do not include any details in that issue.

## What to expect

- We aim to acknowledge a report within 3 working days.
- We will keep you informed of progress and agree on a disclosure timeline.
- Once a fix is released, we will credit reporters who wish to be named.

## Handling secrets

- Never commit secrets, tokens, passwords, private keys or real `.env` files. Only `.env.example` with placeholder values is tracked.
- If you accidentally commit a secret, report it through the process above and rotate the credential immediately; removing it from history is not enough.
