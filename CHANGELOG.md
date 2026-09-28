# Changelog

Changes are recorded using Keep a Changelog categories. Package versions follow Semantic Versioning; the current released version is recorded in `package.json`.

## [Unreleased]

### Fixed

- Pi no longer injects an unconditional `context-mode active` claim or mandatory tool hierarchy into model context. Tool registration, routing enforcement, active memory and resume handling remain unchanged.
- Pi context-injection tests distinguish tool availability from bridge results and verify preserved memory with actual memory content rather than the removed routing message.
