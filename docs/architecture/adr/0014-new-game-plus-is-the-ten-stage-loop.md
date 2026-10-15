# ADR 0014: New Game+ is the ten-stage loop with enemy-health scaling only; the enemy table is validated against the full contract

Purpose: records what "New Game+" means once all ten stages exist (the existing wrap with `cycle + 1`, scaling enemy health only, no stored-schema change) and why the enemy validator stops being incremental. Both are costly to reverse after release because the meaning of the persisted `cycle` counter and the shape of the content contract outlive the code.
Related: [E5 plan](../plans/e5-stages-9-10.md), [ADR 0012 host-owned versioned progress](0012-host-owned-versioned-progress.md), [ADR 0013 enemy health and the hero reaction board](0013-enemy-health-and-hero-reaction-board.md), [ADR 0002 no hero health](0002-no-hero-health.md), [data model sections 7 and 8](../data-model.md), [enemies and stages](../../design/enemies-and-stages.md), [roadmap E5](../../engineering/roadmap.md#e5-stage-9-dragons-lair-stage-10-void-spire), [CLAUDE.md](../../../CLAUDE.md).

## Status

Accepted

## Context

Since E1 the progression wraps to Stage 1 after the last delivered stage and counts `cycle + 1`; the cycle already raises enemy health by 25 percent per cycle, capped at 8 cycles (`healthOf`). The roadmap promised "New Game+ with scaling" in E5. E5 delivers Stage 9 and Stage 10, so the loop finally has its final length (`MAX_STAGE_INDEX` is 10), and the incremental enemy validator (roadmap A3: "check the stages delivered so far") has served its purpose. Two things become permanent: what a stored `cycle` means, and what a valid enemy table is.

Constraints: heroes are invulnerable and their lifecycle comes only from host events (Core invariants 1 and 2), so New Game+ cannot be a harder game for heroes, only longer fights for the same invulnerable party; stored progress is a closed numeric shape ([ADR 0012](0012-host-owned-versioned-progress.md)); no new mechanic is allowed in E5.

## Decision

- **New Game+ is the existing loop.** After the Stage 10 boss falls, `Progression` sets the stage to 1, resets kills, and adds one to `cycle`. There is no new state, no mode flag, no screen, and no hero-side effect. `cycle` stays the only New Game+ datum, and the Stage 1 fade is the only transition.
- **Scaling is enemy health only,** through the existing `healthOf` factor `1 + 0.25 * min(cycle, 8)` (a ceiling of 3.0 times). Speed, attack timing, drops, kills per stage, and hero numbers do not scale (heroes have none). The stored `cycle` itself is not capped (it saturates at `MAX_PROGRESS_COUNT`); only its effect is.
- **No schema change.** `Progress` stays schema version 1 with six integers; `PROTOCOL_VERSION` stays 2; no migration. A `cycle` stored by an earlier build counted shorter passes (four, six, or eight stages); it now counts ten-stage passes, and the health formula is unchanged, so the only effect is that earlier players meet the same factor sooner. Accepted.
- **The enemy table has a fixed contract.** `validateEnemies` checks exactly 10 stages (indexes 1 to 10), exactly 50 rows, 50 unique ids, exactly 5 rows per stage, exactly one boss per stage and at least one minion per stage. The expected counts are constants, not derived from the `stages` argument; the incremental mode is removed. A table that breaks the contract still disables combat only (reported once at boot, stages and heroes keep running, Core invariant 4).

## Consequences

- A test or a tool that builds a game with a partial stage table now gets a disabled combat system and one boot report; such tests must use the full ten stages (replace a row inside a full table) rather than a shortened table.
- Any future stage or enemy count change (an eleventh stage, a sixth enemy per stage) is a deliberate contract edit plus a new ADR superseding this one, and a schema review of `MAX_STAGE_INDEX`.
- New Game+ never rewards or punishes a hero; a UI that shows the cycle (M7) reads `Progress.cycle` and nothing else.
- The stage health curve (a tuning matter, cheap to change) is described in the E5 plan, not decided here.
- Supersession: a harder New Game+ (new enemy behaviors, a mode flag) would need a new ADR and a schema bump through the migration runner.
