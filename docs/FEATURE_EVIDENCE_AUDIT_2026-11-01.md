# Feature evidence audit — 2026-11-01

## Scope and result

- Registered catalogue records: **317**
- Long-term target: **2,000** meaningful player-facing capabilities
- Duplicate IDs: **0**
- Duplicate names after trimming and case normalization: **0**
- Highest RPG numeric suffix: **323**
- Missing RPG numeric suffixes: **RPG-281 through RPG-299**
- Individual feature IDs with manually inspected source + behavior-test traceability links: **31**
- Of those, eight mastery-10 spell capstones have direct numeric unit-test assertions; boss phase entries use handler-level regression assertions.
- Inventory statuses promoted based on this map: **0**
- Discord test-guild verified feature IDs in this audit: **0**
- Production verified feature IDs in this audit: **0**
- Audit complete: **No**

The 317 records are an existing implementation catalogue, not 317 independently proven working features. The missing numeric suffixes may represent deleted, renumbered or never-added records; they must be reconciled against Git history before reuse. Do not silently fill the gap or inflate the feature count.

## Evidence policy

1. A feature remains `implemented_needs_runtime_test` until a feature-specific source reference and behavioral assertion are linked.
2. Source presence alone is not behavior proof.
3. Automated tests do not prove Discord runtime behavior.
4. Test-guild verification does not prove production behavior.
5. Production verification requires observed production evidence.
6. Aliases, files, UI labels and cosmetic variants are not separate features.

## Existing automated evidence discovered

| Suite | Existing coverage established by test names/assertions |
|---|---|
| `scripts/test-discord-scenarios.js` | Co-op, dungeon and raid flows; role selection; combat turns; spell mastery; classes; daily quest chains; persistent discoveries; exploration routes/streaks; treasure; crafting; salvage; history; interaction response behavior |
| `scripts/check-gameplay-integrity.js` | Trade expiry and single-use behavior; transactional daily missions; PvP class/build effects; persistent HP/Mana conversion; equipment sets; gear and item use; player-first lock ordering; trade/market/crafting transaction integrity |
| `scripts/test-economy-crafting-integrity.js` | Market purchase serialization; non-negative balance guard; crafting quantity bounds; material row locking; expiring trade reservations |
| `scripts/test-boss-combat.js` | Damage bounds; boss phase thresholds; raid weakness; reward idempotency; transaction persistence; defeat/expiry behavior |
| `scripts/test-gameplay-persistence.js` | Legendary/epic equipment set activation and removal; deterministic quest-chain reward scaling; HP/Mana base-stat ratio preservation |
| `scripts/test-command-interaction-coverage.js` | Command module discovery/import and valid interaction contracts |
| `scripts/test-command-test-evidence.js` | A command cannot be marked PASS without a Discord response and command-specific behavioral assertions |

A manually inspected traceability map now links 31 selected feature IDs to concrete source markers, named tests and explicit limitations in `feature-evidence.json`. The latest expansion adds RPG-317–RPG-323 for exploration pity, region mastery, crafting drops, quest materials and rewards, boss-tier materials, and dungeon relic rewards. The mapping is intentionally selective; it does not imply that the other 286 records have been individually verified, and it does not promote any inventory status.

## Highest-risk follow-up audit areas

1. Expand the existing traceability map to the remaining 286 records, only when the implementation and behavioral assertion can be matched precisely.
2. Reconcile RPG-281…RPG-299 against Git history and the command/feature catalogue before assigning IDs.
3. Run isolated Discord test-guild scenarios only for features that lack equivalent automated evidence.
4. Keep production verification separate; do not run destructive or economy-mutating tests in the live guild/database.
5. After evidence is linked, update each feature status individually. Do not bulk-upgrade a category.

## New targeted regression coverage\n\n- Exploration pity, regional mastery, region-specific materials, daily quest stage materials, level-scaled quest rewards, boss-tier materials and dungeon-clear relic rewards are mapped to existing tests.
- Solo boss phase transitions, phase-scaled attacks, special attack bonuses and freeze cancellation are checked at handler level.\n- Cooperative raid and final layered-dungeon boss phase transitions and damage scaling are checked at handler level.\n- All eight mastery-10 spell awakenings are checked numerically, including level-9 lockout and level-10 clamping.\n- The inventory validator now accepts the established RPG/SRV/FUN/SOC ID namespaces, rejects malformed records and duplicates, and reports RPG gaps without filling them.\n\n## Protected boundaries

- No production database writes were made for this audit.
- No Discord live command registration was changed.
- No Render or Vercel deployment was triggered.
- Existing feature statuses remain conservative; no unproven feature was promoted to verified.
