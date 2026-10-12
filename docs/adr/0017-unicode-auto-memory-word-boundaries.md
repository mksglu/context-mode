# Unicode word boundaries in auto-memory search

## Context

Auto-memory search uses ASCII word boundaries around literal query terms. Project instruction files containing Russian, Arabic, Hindi, or accented French terms are missed, while an ASCII term inside a larger accented word can match incorrectly.

## Decision

Match terms literally and inspect their surrounding characters structurally. Preserve ASCII identifier and apostrophe boundary behavior. Use the standard Intl grapheme and word parsers for non-ASCII boundary characters, with lazy segmentation and cached grapheme classification. Split query whitespace without regular expressions and retain the existing minimum term length.

## Alternatives

A Unicode regular expression would violate the contribution rule against new regular expressions. Segmenting entire files into words would change ASCII identifier and apostrophe behavior and eagerly process content with no literal matches. Substring matching would admit partial words.

## Consequences

Multilingual terms can retrieve project memory and ASCII substrings inside accented words are excluded. Existing ASCII matching and result limits remain unchanged. This requires the Intl.Segmenter implementation supplied by supported Node runtimes. This change does not normalize composed and decomposed Unicode or alter snippet extraction.

## Validation

The same six regression cases on immutable next source produced one pass and five failures. Candidate regression, auto-memory configuration, unified search, and adapter memory-convention suites passed 224 tests. TypeScript typecheck and diff whitespace checks passed. Tests use owned temporary project and configuration directories. No live Claude client path has been verified: the earlier isolated client attempts encountered OAuth 401, and were not retried. Full-suite results and separate review are recorded in the campaign evidence rather than claimed here.
