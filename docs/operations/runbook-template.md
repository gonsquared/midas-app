# Runbook: <task or incident name>

- **Owner:** team or person responsible for keeping this accurate
- **Last verified:** YYYY-MM-DD, by whom, against which version or environment
- **Severity / urgency:** how fast this must be done, or "routine"

## When to use this

The symptom or trigger, in one or two sentences. Include the alert or log line someone would see.

## Before you start

- Access you need (accounts, roles, VPN) and how to get it.
- Tools and versions.
- Anything that must be true first (for example, a recent backup exists).

## Steps

1. What to do, as an exact command or click path.

   ```bash
   command --with --real --flags
   ```

   Expected result: what success looks like.

2. Next step. If the result differs from expected, go to [Troubleshooting](#troubleshooting).

## Verify

How to confirm the system is healthy afterwards (health endpoint, a query, a user-visible check).

## Roll back

How to undo the steps, and the point after which rolling back is no longer safe.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| | | |

## Escalate

Who to contact when this does not work, and what to tell them (what you tried, the outputs).

## After

- Follow-up tasks, and where to record the incident or the change.
