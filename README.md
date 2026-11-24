# companion-module-nerif-tafu-casparcgadvancedclient

A [Bitfocus Companion](https://bitfocus.io/companion) module for CasparCG Advanced Client by nerif-tafu: rundowns, playlists, takes and layers. It is not for the original CasparCG Client (2.x), or for a CasparCG server directly.

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE)

## Getting started

Executing a `yarn` command should perform all necessary steps to develop the module, if it does not then follow the steps below.

The module can be built once with `yarn build`. This should be enough to get the module to be loadable by companion.

While developing the module, by using `yarn dev` the compiler will be run in watch mode to recompile the files on change.

## How it works

The module signs in to the client's web interface with the access code and listens to its live events, so it needs no polling.

| File               | What it holds                                                         |
| ------------------ | --------------------------------------------------------------------- |
| `src/link.ts`      | Signing in, the live events, calls and reconnecting                   |
| `src/state.ts`     | What the client says, and what can be worked out from it (no network) |
| `src/choices.ts`   | The option fields, and the entries and servers they offer             |
| `src/variables.ts` | Variables, sent only when they change                                 |
