# Backlog

Features waiting for the factory. `node factory/bin/factory.mjs next` starts the
first unchecked item as a new job (one job per loop) and checks it off with the
job id.

- [ ] Rate limiting for the public API (per-client token bucket, 429 + Retry-After)
- [ ] CSV export for reports
- [ ] Audit log retention policy
