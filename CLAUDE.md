@AGENTS.md

> **Contributors:** for development setup, repo layout, and the tool-design checklist see [CONTRIBUTING.md](./CONTRIBUTING.md). The agent usage guide is loaded on demand from [skills/figma-edit/references/](skills/figma-edit/references/) — it is no longer inlined here, to keep the in-repo context cost near zero.
>
> **If you are writing or reviewing tests, read [CONTRIBUTING.md § Tests](./CONTRIBUTING.md#tests) first.** Two rules there have each been violated repeatedly in this repo, by careful authors, with a green suite: **red-proof every regression** (break the production line on purpose and confirm a test fails — a test that passes before and after a fix is not a guard), and **mocks cannot establish Figma's behaviour** (a stub proves only what you told it).
