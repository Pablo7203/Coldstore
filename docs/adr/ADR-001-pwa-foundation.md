# ADR-001: Minimal Native Service Worker Foundation

Status: Accepted for Phase 0

Date: 2026-10-11

## Context

The product requires a PWA and a safe service-worker foundation, but Phase 0 must not implement offline POS data or cache authenticated business responses. A library choice would add dependencies and implementation behavior before those workflows exist.

## Decision

Use a small, hand-authored service worker served from `public/`, registered only in production. Use Next.js App Router's typed manifest route. Pre-cache only the public offline fallback and manifest. Network-first navigation may cache the public foundation homepage. Bypass API routes and requests with authorization headers or cookies. Version the app cache, remove only old Grand Pa caches on activation, and send no-store update headers for the worker script.

## Alternatives Considered

- Add a PWA plugin now: deferred until the offline POS phase defines its exact integration needs.
- Cache all Next.js assets and requests: rejected because it risks caching authenticated business responses indiscriminately.

## Consequences

The foundation demonstrates install metadata, offline fallback, and conservative public-shell caching without introducing a service-worker dependency. The worker will need review as application routes and offline POS are added.

## Reversal / Migration Notes

Any replacement strategy must preserve the no-sensitive-response-caching rule and be documented before implementation.
