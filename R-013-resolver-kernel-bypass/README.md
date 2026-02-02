# R-013: Resolver Kernel Bypass Prevention

## Purpose
Ensures resolvers maintain semantic truth by:
- Blocking unresolved variables before LLM calls
- Preventing direct prompt parsing for variable extraction
- Never defaulting missing values to hallucinated data

## Requirements
Resolvers must:
- Return `{ error: "UNRESOLVED_VARIABLES" }` for prompts with unresolved placeholders
- Only use kernel-provided context (never parse prompts directly)
- Never fabricate default values (like `$0` for missing balances)

## Certification Impact
Failure indicates resolver bypasses O-Lang's kernel mediation layer, violating the core trust model.