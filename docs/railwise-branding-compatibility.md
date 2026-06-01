# Railwise Branding Compatibility

## Public Brand

Use `Railwise`, `RAILWISE`, or `睿威智测` in user-facing UI, docs, installers, release notes, website metadata, support links, and downloadable artifact names.

Do not introduce the legacy Reasonix product name in new public copy. The only exceptions are compatibility names listed below.

## Compatibility Names Kept For Now

The following legacy `reasonix` names are retained to avoid breaking existing users, saved sessions, updater identity, and local integrations:

- `~/.reasonix/` and `<project>/.reasonix/` remain the storage roots for config, sessions, skills, memory, hooks, and transient tool output.
- `REASONIX.md` and `REASONIX_MEMORY` remain the project/global memory file and environment switch.
- `reasonix.lang` and `reasonix.version` remain browser storage keys so language and version cache preferences survive upgrades.
- `ReasonixConfig` remains the TypeScript config type name until a typed API migration can provide an alias period.
- `reasonix-desktop` and `dev.reasonix.desktop` remain package and app identifiers until the desktop updater and installed-app identity can migrate safely.
- `x-reasonix-token` remains the local dashboard CSRF header for compatibility with existing clients.

## Migration Rule

Any future rename from a compatibility name to a `railwise` name should be a dedicated migration, not a casual text replacement. The migration must dual-read old and new locations, preserve existing data, write the new location after successful import, keep a fallback for at least one release cycle, and update the branding regression test with the new boundary.
