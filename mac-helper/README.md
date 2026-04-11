# Bubble Helper

`Bubble Helper` is the local macOS companion for the hosted Bubble app.

It is responsible for:

- Reading your local Messages database on your Mac
- Resolving iMessage handles against Contacts when allowed
- Keeping the private identity map on-device only
- Sending only minimal Bubble-safe updates back to `bubble.garden`

It does **not** upload:

- Message bodies
- Attachments
- Raw phone numbers or email handles
- Apple Contacts identifiers
- Chat or thread IDs

## Build

Bubble Helper needs a working Apple Swift toolchain for macOS app builds. A full Xcode install is safest; Command Line Tools alone can fail if the local compiler and SDK are out of sync.

From the repo root:

```bash
npm run helper:build
```

Or directly:

```bash
swift build \
  --package-path mac-helper \
  --cache-path mac-helper/.swiftpm/cache \
  --config-path mac-helper/.swiftpm/config \
  --security-path mac-helper/.swiftpm/security \
  --manifest-cache local \
  --scratch-path mac-helper/.build \
  -Xswiftc -module-cache-path \
  -Xswiftc mac-helper/.build/module-cache \
  -Xcc -fmodules-cache-path=mac-helper/.build/clang-module-cache
```

## Run

```bash
npm run helper:run
```

The helper launches as a menu bar app. This source-run mode is mainly for development and still depends on the Terminal process that launched it staying alive.

## Package

```bash
npm run helper:package
```

This creates a standalone app bundle at `mac-helper/dist/Bubble Helper.app`.

## Install

```bash
npm run helper:install
```

This packages the helper, installs it to `~/Applications/Bubble Helper.app`, quits any already-running helper process, and opens the installed app. Once launched this way, Bubble Helper no longer depends on Terminal or VS Code staying open.

## Permissions

The helper expects:

- `Full Disk Access` so it can read `~/Library/Messages/chat.db`
- `Contacts` access if you want saved names and profile photos

Contacts access is optional. Full Disk Access is required for iMessage monitoring.

When running the installed app bundle, grant these permissions to `Bubble Helper.app` in macOS System Settings. When running from source with `npm run helper:run`, macOS may instead attribute those permissions to Terminal.

## First Run

1. Open Bubble on the web and generate a `Helper Access` token.
2. Install and launch `Bubble Helper.app`.
3. Open `Settings`.
4. Paste your Bubble URL and helper token.
5. Grant Full Disk Access.
6. Use `Import from iMessage` to search for a person, then either:
   - create a new Bubble, or
   - link them to an existing Bubble
7. Optionally enable `Start Bubble Helper at login` in Settings after you are running the installed app.

## Local Data

The helper stores its local state under Application Support, encrypted with a key kept in macOS Keychain.

That local state includes:

- the last processed Messages row id
- hashed identity-to-Bubble links
- ignored identities
- helper token in Keychain
