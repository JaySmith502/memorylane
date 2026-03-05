# MemoryLane v0.13.9

Patch release focused on safer Slack semantic replies and configurable semantic timeout.

## What's Changed

- **Slack safety guardrails** - semantic reply flow now classifies intent before research and blocks password, secret, and sensitive-topic requests
- **Configurable LLM timeout** - semantic request timeout is now configurable (default `120s`) with clearer timeout wording in settings
- **Slack setup docs** - added Slack app setup guide and a ready-to-paste manifest template
- **Maintenance** - removed obsolete Claude GitHub Actions workflows

## Full Changelog

https://github.com/deusXmachina-dev/memorylane/compare/v0.13.8...v0.13.9
