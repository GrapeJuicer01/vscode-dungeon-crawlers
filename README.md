# Pixel Agents

Purpose: what the Pixel Agents VS Code extension does, the promises it makes about your agents, and how to build and run it from source.
Related: [docs index](docs/index.md), [contributing](CONTRIBUTING.md), [changelog](CHANGELOG.md), [CLAUDE.md](CLAUDE.md).

## What it does

Pixel Agents adds a "Pixel Agents" tab to the VS Code bottom panel. The tab renders an animated 2D pixel-art dungeon crawler. Each active Claude Code agent session appears as a hero who fights through dungeon biomes while the agent works and rests at a campfire while the agent is idle. When the session ends, the hero warps out.

Current state (0.0.1, engine): the panel tab shows Stage 1, "The Forgotten Cellar", a torch-lit stone cellar with a campfire, drawn crisp at an integer scale. Each agent the monitor reports is a pixel hero: it warps in at the door, walks down the corridor and advances (the corridor scrolls and the hero swings a plain sword) while the agent is working, rests at the campfire in changing poses (sitting, eating, reading, polishing, warming hands, sleeping) while it is idle, and does a victory pose and warps out when the session ends. Each hero is one of eight classes (Warrior, Mage, Archer, Rogue, Cleric, Paladin, Necromancer, or Bard), chosen from its session id, with its own look and a small cosmetic effect it plays while fighting; the Necromancer is joined by a decorative skeleton. There are no enemies, text, or sound yet; those arrive in later milestones (see the [roadmap](docs/engineering/roadmap.md)). You can also watch the monitor in the "Pixel Agents" output channel with the log level set to Trace.

To try it without a Claude Code session, set `pixelAgents.simulator` to `on` and `pixelAgents.simulatorAgentCount` to a number between 1 and 16: simulated `Sim ...` agents spawn, work, idle, and leave on their own.

## Observe only

Pixel Agents is a status display. It is built around a few promises:

- **It never controls your agents.** The extension only observes Claude Code sessions. It never writes to, signals, stops, or sends input to any process or terminal. Clicking a hero only reveals that agent's terminal.
- **The panel can only ask to show a terminal.** The only request the panel can send to VS Code is to reveal an agent's terminal; it can never ask VS Code to control, stop, or type into it.
- **Heroes never die.** Heroes have no health, mana, or gauges, and nothing in the game can hurt, stop, or remove them. A hero's state follows its real agent session, and nothing else.
- **Your transcripts stay private.** The extension reads Claude Code transcripts only to learn a session's id, name, state, current tool name, and timestamp. Transcript content is never stored, logged, or sent anywhere.
- **Nothing extra ships.** No runtime dependencies, no image or audio files. Sprites are drawn from pixel maps in code, and sound is synthesized with Web Audio.

The full list of invariants is in [CLAUDE.md](CLAUDE.md#core-invariants-never-violate-escalate-to-the-human-if-a-task-seems-to-require-it).

## Privacy

The monitor reads Claude Code's transcript files (`~/.claude/projects/<project>/<session>.jsonl`) read-only and keeps exactly five facts per session: the session id, a display name, the state (spawned, working, idle, ended), the current tool name (for example `Bash`), and the time of the last change. The display name is your workspace folder name (or a label from the project directory name) plus the first four characters of the session id; it never comes from transcript or terminal text. Nothing else from a transcript is kept: lines are parsed and dropped in the same step, and errors are logged as codes such as `EACCES`, never with their text or a file path.

By default (`pixelAgents.projectScope: "workspace"`) only the sessions of the folders open in the current window are read. With `"all"`, the transcripts of every project on this machine are read and their sessions appear in every VS Code window (still five fields only). Nothing is persisted, and nothing is sent anywhere: the five fields go only to the panel in your own VS Code window. The monitor never writes, creates, locks, or deletes a file, never follows symbolic links below the transcript directory, never reads `~/.claude/settings.json` or hooks, and never types into, stops, or closes a terminal.

## Configuration

All settings live under `pixelAgents.*` and apply immediately.

| Setting | Default | Range | Meaning |
|---|---|---|---|
| `pixelAgents.simulator` | `auto` | `auto`, `on`, `off` | Simulated agents for a demo. They are named `Sim ...` (ids start with `sim-`) and are not real sessions. `auto` shows them only while no real session is detected |
| `pixelAgents.simulatorAgentCount` | `3` | 1 to 16 | number of simulated agents |
| `pixelAgents.projectScope` | `workspace` | `workspace`, `all` | which project transcripts are read (see [Privacy](#privacy)); user or remote settings only |
| `pixelAgents.transcriptPath` | empty (`~/.claude/projects`) | absolute path or `~/...` | transcript root; read-only, symbolic links below it are never followed; user or remote settings only |
| `pixelAgents.idleTimeoutSeconds` | `60` | 5 to 3600 | silence before a working agent with no pending tool is idle |
| `pixelAgents.toolTimeoutSeconds` | `300` | 30 to 86400 | silence before a working agent with a pending tool (for example a long build) is idle; at least the idle timeout |
| `pixelAgents.sessionEndTimeoutMinutes` | `30` | 1 to 1440 | silence before a session counts as ended and its hero leaves; at least the tool timeout |
| `pixelAgents.debounceMs` | `750` | 0 to 10000 | smoothing: delay from spawn to the first state, quiet time after a turn ends, and the per-agent update window |
| `pixelAgents.pollIntervalMs` | `1000` | 250 to 10000 | time between transcript polls |

A session ends (its hero leaves) when its transcript file is removed, when it leaves the configured scope, or after `sessionEndTimeoutMinutes` of silence. Closing a terminal never ends a session.

**Relocated Claude Code configuration.** If you moved Claude Code's configuration directory (for example with `CLAUDE_CONFIG_DIR`), the extension does not read that environment variable. Set `pixelAgents.transcriptPath` in your user settings to the `projects` folder inside it, for example `~/my-claude-config/projects`.

## Development setup

Requirements: Node 22 (see `.nvmrc`) and VS Code 1.90 or newer.

```sh
npm install
npm run build
```

Then open the folder in VS Code and press F5 ("Run Pixel Agents"). In the Extension Development Host window, open the bottom panel and select the "Pixel Agents" tab.

## Commands

| Command | Purpose |
|---|---|
| `npm install` | install dev dependencies |
| `npm run build` | bundle the host (Node, CommonJS) and webview (browser, IIFE) into `dist/` |
| `npm run watch` | rebuild on change |
| `npm run package` | produce the `.vsix` with `vsce` |
| `npm run lint` | ESLint, Prettier check, and markdownlint |
| `npm run format` | format with Prettier |
| `npm run typecheck` | `tsc` over the host, webview, and tools projects, strict |
| `npm run test` | unit and repository tests (Node's built-in `node:test`) |
| F5 | launch the Extension Development Host (`.vscode/launch.json`) |

`npm run docs:tables` (regenerate the enemy and class tables in the docs) arrives with the first data tables.

## Documentation

Start at the [docs index](docs/index.md). Contribution rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
