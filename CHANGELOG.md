# Changelog

All notable changes to this project are documented in this file.

## 0.0.2 - 2026-04-18

### Added
- VS Code language support for `.vn` files (language contribution + TextMate grammar).
- Autocomplete for commands, scene names, actors, variables, assets, and context-aware `@action` keys.
- Lint diagnostics for scene/header placement, flow control alignment, choice nesting, and indentation rules.
- Snippets for scene headers, `if/else`, choice blocks, and generic `@` actions.
- Integration tests for diagnostics and completion behavior.
- CI workflow for build + test and release workflow for VSIX packaging.

### Changed
- Improved test harness robustness for CI environment differences.
- Refined packaging include/exclude rules via `.vscodeignore`.
- Hardened extension metadata for Marketplace readiness (homepage/issues/repository/qna/banner).

### Fixed
- Corrected false-positive choice linting for valid `> choice $var: "..."` syntax.
- Resolved extension id lookup issue in CI test host by deriving it from package metadata.
