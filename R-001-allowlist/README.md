# R-001 Allowlist Resolver Test

**Purpose:**  
This test verifies that the O-Lang parser correctly captures and normalizes the list of allowed resolvers declared in a workflow.

**Workflow:**  
- Workflow Name: `TestResolverAllowlist`
- Allowed Resolvers:
  - `SimpleResolver`
  - `AdvancedResolver`

**Assertions:**  
1. All allowed resolvers are captured correctly.  
2. Resolver names are normalized (no spaces, invalid characters).  
3. Workflow name is correctly parsed.  
4. No parser warnings are generated for valid syntax.

**Spec References:**  
- §4.2 Allowed Resolvers  
- §3.1 Workflow Parsing  
- §2.3 Symbol Normalization
