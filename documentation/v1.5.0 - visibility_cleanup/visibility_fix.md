# figma-edit-mcp — Search Visibility Fix Plan

The root cause of the repo not appearing in search engine results is that GitHub serves a `noindex` robots tag on fork pages. Until the repo is detached from the fork network, no amount of README tuning, topic curation, or directory listing will get it into Google's index.

Everything below is ordered by impact.

---

## 1. Detach the fork (mandatory, unblocks everything else)

This is a manual operation handled by GitHub Support — it is not self-serve.

**Action:** Open a support ticket at https://support.github.com/contact (category: "Repositories").

**Suggested message:**

> Hi GitHub Support,
>
> I'd like to request that my repository `neozhehan/figma-edit-mcp` be detached from its parent network (`grab/cursor-talk-to-figma-mcp`) and made a standalone root repository.
>
> The fork has diverged substantially from the upstream — it adds plugin-side hallucination safeguards (scope restriction, node name verification), a `bun integrate` configuration workflow, a different toolchain, and a rewritten README and tool surface. It is no longer a candidate for upstream contribution and functions as an independent project.
>
> Detaching would also allow the repo to be indexed by search engines, which is currently blocked by the `noindex` meta tag applied to fork pages.
>
> Thanks.

Turnaround is typically 1–3 business days. They almost always grant this for substantially diverged forks.

---

## 2. README updates (do these after detachment is approved)

Once the repo is standalone, the README's own language should stop calling it a fork. Both readers and indexers pick up on this.

### 2a. Hallucination Safeguards section

**Current:**
> This fork adds multiple layers of protection against AI hallucination damage.

**Change to:**
> Figma Edit MCP adds multiple layers of protection against AI hallucination damage.

### 2b. Acknowledgements section

**Current:**
> This project is a fork of [grab/cursor-talk-to-figma-mcp](https://github.com/grab/cursor-talk-to-figma-mcp) by [sonnylazuardi](https://github.com/sonnylazuardi).
> Thank you to the original authors and contributors for the foundation this project builds on.

**Change to:**
> Built on prior work by [sonnylazuardi](https://github.com/sonnylazuardi) and the contributors to [grab/cursor-talk-to-figma-mcp](https://github.com/grab/cursor-talk-to-figma-mcp). Thank you for the foundation this project builds on.

This preserves credit (which is required by MIT anyway) without re-asserting fork status in the readable copy.

---

## 3. Repository settings (do these now — don't wait for detachment)

### 3a. Tighten topic tags

The current 12 topics dilute keyword signal. Trim to 5–6 high-match topics. Recommended:

- `mcp`
- `mcp-server`
- `figma`
- `figma-plugin`
- `model-context-protocol`
- `design-automation`

Remove: `vscode`, `cursor`, `github-copilot`, `claude-desktop`, `claude-code`, `antigravity`, `design-tools`, `figma-design`. These are integration targets, not what the project *is* — they belong in the README, not as topics.

### 3b. Confirm the "About" description is set

Currently: *"Connect AI assistants to Figma via MCP — Read, Create, & Modify designs programmatically."*

This is good. Keep it. After detachment, GitHub will use this as the `meta description` and `og:description` — that's what Google shows as the snippet under the title.

### 3c. Enable engagement features

In Settings → General → Features, enable:
- **Issues**
- **Discussions**

These produce additional indexable URLs that link back to the main repo and signal an active project. The comparison repo (`asamuzak09/figma-edit-mcp`) has both enabled.

---

## 4. Submit to MCP directories (after detachment)

`smithery.yaml` is already in the repo, so Smithery is set. Add the others:

- **Smithery** — https://smithery.ai (auto-detects via the YAML once you connect the repo)
- **MCP.so** — https://mcp.so/submit
- **Glama** — https://glama.ai/mcp/servers (submit form)
- **GitHub MCP Registry** — https://github.com/mcp (newer, worth listing)

Each gives you a referring backlink from a high-authority MCP-topic domain, which helps both direct traffic and search ranking.

---

## 5. Request indexing

Once detachment is confirmed and the README is updated:

1. Open Google Search Console (free, sign in with the Google account you want).
2. Add a property for `https://github.com/neozhehan/figma-edit-mcp` (URL-prefix property).
3. Use the URL Inspection tool → "Request Indexing".
4. Repeat for `/blob/main/readme.md`.

Indexing usually happens within a few days after the request, vs. weeks if you wait passively.

---

## 6. Build the first social signals

Even a fully-indexed standalone repo with zero stars ranks weakly. A handful of stars and one or two external links closes the gap.

- Post on LinkedIn (you already have the URL in the repo's website field — leverage your existing network). Lead with the safety angle: "I built guardrails into the Figma MCP plugin so AI agents can't hallucinate destructive edits on the wrong layer." That framing differentiates from the dozen other Figma MCP repos.
- Cross-post a shorter version on X / Bluesky if you use them.
- Share in the Anthropic MCP Discord (`#showcase` or equivalent) and the Cursor community.
- Aim for 10–20 stars in the first week. That's enough to move from "invisible" to "shows up for `figma-edit-mcp` exact match and tail queries like `figma mcp hallucination safeguards`."

---

## Verification checklist

After completing steps 1–3, confirm the fix worked:

- [ ] `view-source:https://github.com/neozhehan/figma-edit-mcp` no longer contains `<meta name="robots" content="noindex">`
- [ ] The page no longer shows "forked from grab/cursor-talk-to-figma-mcp" under the repo name
- [ ] The Forks counter shows your own fork count (likely 0), not 666
- [ ] `meta-octolytics-dimension-repository_is_fork` in the HTML is `false`
- [ ] `site:github.com/neozhehan/figma-edit-mcp` returns results on Google within ~7 days of requesting indexing

If all five pass, the visibility problem is fully resolved and any remaining ranking issues are about competition and authority, not crawlability.
