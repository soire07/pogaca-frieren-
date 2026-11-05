# Maceracı Kullanıcı Merkezi Implementation Plan

> **For agentic workers:** Native inline execution in this session. Tasks are grouped into one reviewable PR and one pre-production delivery.

**Goal:** Existing RPG data powers a complete, mobile-friendly profile and progress center under the three-dot menu, including privacy controls and VIP XP presentation.

**Architecture:** Extend the existing public-site route layer and player-experience persistence module. Reuse users, achievement_claims, user_titles, adventure_history, arena_ratings and existing collection/home tables; add only a small guild/user-scoped profile-preferences table.

**Tech Stack:** Node.js ESM, existing PostgreSQL schema, server-rendered HTML, CSS, node:test, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-11-05-adventurer-user-center-design.md

## Global Constraints
- Preserve current RPG systems and existing routes.
- Every player query is scoped by linked account + guild_id + user_id.
- No production DB writes, Discord live actions, merge or deploy.
- VIP is server-authoritative via FRIEREN_VIP_ACCOUNT_IDS; no client override.
- Use the existing XP formula from utils.js.
- Daily board is adventure-history XP for the last 24 hours, not all XP sources.
- Public profile sections remain opt-in and the public home share gate remains authoritative.
- No paid APIs or new runtime dependencies.

## Review Focus
- Invalid or mismatched XP/level values; show canonical level from XP.
- Cross-guild and unlinked Discord user IDs supplied in URL/form.
- Public profile visibility disabled while individual data sections are enabled.
- Active title selected but not owned by the linked character.
- Empty collections/activity/arena data and users with multiple linked servers.

---

### Task 1: Profile settings and achievement metadata

**Files:**
- Modify: player-experience.js
- Modify: basarimlar.js
- Modify: scripts/test-player-experience.js
- Modify: scripts/test-public-site.js

- [ ] Add failing tests for default profile privacy settings, accepted settings, invalid settings, and unowned active titles.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Add `player_profile_settings` table with guild/user foreign key and defaults that do not broaden public exposure.
- [ ] Add read/update helpers; validate all booleans and require active title to exist in user_titles.
- [ ] Export existing achievement metadata for reuse by the site; do not duplicate title/emoji/reward definitions.
- [ ] Run focused tests and full npm test.

### Task 2: Profile page, accurate XP, activity and rankings

**Files:**
- Modify: public-site.js
- Modify: site.css
- Modify: scripts/test-public-site.js

- [ ] Add failing route tests for account/guild-scoped profile, XP boundary calculation, titles, stats, recent activity, collections, and leaderboards.
- [ ] Add /maceraci/profil route with guild picker when no guild is selected.
- [ ] Render real character data, level progress, arena/boss/dungeon stats, owned titles, pinned achievements, collection counts, recent activity and rankings.
- [ ] Use a server-scoped leaderboard and label the 24-hour adventure XP board precisely.
- [ ] Add anchors and point every User Center menu link at its real section.
- [ ] Run focused tests and full npm test.

### Task 3: Public privacy controls and VIP polish

**Files:**
- Modify: player-experience.js
- Modify: public-site.js
- Modify: scripts/test-public-site.js
- Modify: site.css
- Modify: .env.example

- [ ] Add failing tests for public settings and private-by-default behavior.
- [ ] Add CSRF-protected profile visibility settings to the existing /maceraci/yasam mutation flow.
- [ ] Filter public home showcase sections using saved settings while retaining the existing is_public gate.
- [ ] Keep six existing trophy slots; highlight the first three as profile pins.
- [ ] Use utils.js levelForXp/xpForNextLevel for the XP bar; handle malformed XP and reduce-motion.
- [ ] Normalize server-side VIP allowlist identifiers and never trust request parameters.
- [ ] Run focused tests and full npm test.

### Task 4: Whole-branch verification

- [ ] Inspect changed files and compare against the design.
- [ ] Run repository check and npm test through GitHub Actions.
- [ ] Review all CI checks and resolve critical/important findings in one pass.
- [ ] Keep PR draft until checks are green; no merge or production deployment.
