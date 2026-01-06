# O-Lang Resolver Test Suite

**Version:** 1.0.0  
**Author:** Your Name  
**License:** MIT

---

## Overview

This repository provides the **official O-Lang Resolver Test Harness**, designed to validate any O-Lang resolver implementation against:

- Allowlist compliance
- Input/output contracts
- Failure modes

It mirrors the **kernel test philosophy**: deterministic, safe, and locked to a single entrypoint.

All tests are **self-contained** in folders `R-001`, `R-002`, `R-003`, etc., each containing:

- `resolver.ol` — the resolver under test  
- `test.json` — the assertions for this test suite  
- `README.md` — notes for this suite  

---

## Folder Structure

