# Pixel Agents

Purpose: what the Pixel Agents VS Code extension does, the promises it makes about your agents, and how to build and run it from source.
Related: [docs index](docs/index.md), [contributing](CONTRIBUTING.md), [changelog](CHANGELOG.md), [CLAUDE.md](CLAUDE.md).

## What it does

Pixel Agents adds a "Pixel Agents" tab to the VS Code bottom panel. The tab renders an animated 2D pixel-art dungeon crawler. Each active Claude Code agent session appears as a hero who fights through dungeon biomes while the agent works and rests at a campfire while the agent is idle. When the session ends, the hero warps out.

Current state (0.0.1, scaffold): the panel tab opens and shows a blank, crisp, integer-scaled dark canvas. Agent detection, the game, and audio arrive in later milestones (see the [roadmap](docs/engineering/roadmap.md)).

## Observe only

Pixel Agents is a status display. It is built around a few promises:

- **It never controls your agents.** The extension only observes Claude Code sessions. It never writes to, signals, stops, or sends input to any process or terminal. Clicking a hero only reveals that agent's terminal.
- **The panel can only ask to show a terminal.** The only request the panel can send to VS Code is to reveal an agent's terminal; it can never ask VS Code to control, stop, or type into it.
- **Heroes never die.** Heroes have no health, mana, or gauges, and nothing in the game can hurt, stop, or remove them. A hero's state follows its real agent session, and nothing else.
- **Your transcripts stay private.** The extension reads Claude Code transcripts only to learn a session's id, name, state, current tool name, and timestamp. Transcript content is never stored, logged, or sent anywhere.
- **Nothing extra ships.** No runtime dependencies, no image or audio files. Sprites are drawn from pixel maps in code, and sound is synthesized with Web Audio.

The full list of invariants is in [CLAUDE.md](CLAUDE.md#core-invariants-never-violate-escalate-to-the-human-if-a-task-seems-to-require-it).

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
