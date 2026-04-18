# VN-Sutra Language Tools

VS Code extension support for `.vn` story scripts used by VN-Sutra.

## Features

- Syntax highlighting for scene headers, commands, variables, dialogue actors, `@` actions, strings, numbers, and comments.
- `.vn` file icon contribution for language-specific file identity.
- Autocomplete for:
  - control keywords (`if`, `switch`, `repeat`, etc.)
  - shorthand commands (`jump:`, `bg:`, `music play:`, etc.)
  - common `@action.type` entries
  - context-aware `@` keys based on action type
  - enum values like transition types and boolean literals
  - in-file symbols (scene names, actor names, assets, `$variables`, and choice options)
- Lint diagnostics for:
  - content before first scene header
  - `else` without a matching `if`
  - `case/default` outside `switch`
  - choice branch lines outside a `> choice` block
  - block body indentation and 4-space indent step checks
  - optional warnings for tab-based indentation
  - unknown lines that likely fall back to raw dialog
- Project workflow commands:
  - create a new VN-Sutra project from latest repository release source
  - run project setup (`npm install`, `npm run dev`)
  - run any workspace npm script from a picker
  - refresh dynamic script commands when package scripts change

## Commands

Available in Command Palette under `VN-Sutra`:

- `Create New VN Project`
- `Run Project Setup (npm install + npm run dev)`
- `Run NPM Script From package.json`
- `Refresh Dynamic Script Commands`

### Create Project flow

`Create New VN Project` does the following:

1. Prompts for a target folder and requires it to be empty.
2. Fetches latest VN-Sutra source metadata from GitHub (with tag/branch fallbacks).
3. Downloads and extracts the source zip into the chosen folder.
4. Optionally opens the created project folder (current window or new window).

Use `Run Project Setup (npm install + npm run dev)` after opening the project.

## Project layout

- `src/extension.ts`: completions + diagnostics provider
- `syntaxes/vn.tmLanguage.json`: TextMate grammar
- `language-configuration.json`: comments, indentation, and bracket pairs
- `snippets/vn.code-snippets`: starter snippets

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Compile:

   ```bash
   npm run compile
   ```

3. Press `F5` in VS Code and run **Run VN-Sutra Extension**.
4. In the Extension Development Host, open `examples/test.vn`.
5. Verify highlighting, completions, and diagnostics.

## Quick test checklist

- Trigger completion after `jump:`, `@`, and `$`.
- Confirm scene, actor, and variable suggestions appear.
- Confirm diagnostics appear on intentionally invalid lines at the end of `examples/test.vn`.
- Toggle settings under `vnsutra.lint.*` and verify diagnostics update.
- Validate project commands from Command Palette (`VN-Sutra: ...`).

## Automated tests

- Run all extension integration tests:

  ```bash
  npm test
  ```

- Test fixtures are in `test/fixtures/`.

## CI and release

- CI runs `npm test` on push and pull request via `.github/workflows/ci.yml`.
- Release packaging workflow is in `.github/workflows/release.yml`.
- To package locally:

  ```bash
  npm run package:vsix
  ```

- Tag format for release workflow: `v*` (for example `v0.1.0`).

## Notes

The implementation follows `VN_SCRIPT_SYNTAX.md` as the source reference.
