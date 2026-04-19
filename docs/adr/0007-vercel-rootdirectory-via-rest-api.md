# ADR-0007: Configure Vercel rootDirectory via REST API, Not CLI

**Date:** 2026-03-19
**Status:** Accepted

## Context

The repo is a monorepo: the dashboard lives in `dashboard/` while the Python pipeline is at the root. Vercel needs to know that `dashboard/` is the project root so it runs `npm install` and builds from there. The natural expectation is to pass `--root-dir dashboard` to the CLI, but this flag does not exist.

## Decision

Set `rootDirectory` to `"dashboard"` via a `PATCH /v9/projects/{id}` REST API call. The `dashboard/vercel.json` file must exist inside that `rootDirectory` — Vercel looks for build config relative to `rootDirectory`, not the repo root. Deploy with `cd dashboard && vercel --prod --yes`.

## Alternatives Considered

**`--root-dir` CLI flag** — does not exist. Multiple attempts confirmed this is not a supported CLI option despite appearing in some third-party documentation.

**Move dashboard to repo root** — would conflate the Python pipeline and frontend into the same directory, making the repo structure worse. Rejected.

**Separate repository for dashboard** — overhead not worth it for a proof-of-concept. Rejected.

## Consequences

The one-time REST API setup is undocumented in the Vercel CLI docs and easy to forget. Auth token lives at `~/Library/Application Support/com.vercel.cli/auth.json`. Future changes to build config go in `dashboard/vercel.json`. If the Vercel project is ever recreated, the `rootDirectory` must be re-set via REST API.
