# Vendored agents

These six subagent definitions come from [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)
(MIT © 2025 AgentLand Contributors), selected for this project:

| Agent | Why it's here |
|---|---|
| `engineering-i18n-engineer` | RTL and bidirectional layout — the core constraint of an Arabic site |
| `design-ui-designer` | Visual system and component consistency |
| `design-brand-guardian` | Keeps type, colour and tone consistent with the brand mark |
| `engineering-frontend-developer` | Static frontend work |
| `specialized-cultural-intelligence-strategist` | Copy and imagery decisions for a Saudi, Arabic-speaking audience |
| `marketing-instagram-curator` | The shop's main channel is Instagram |

Only change from upstream: the `name:` field was normalised to match each filename so
Claude Code can address the agent by its slug.

The full roster of 295 agents lives in the upstream repo.
