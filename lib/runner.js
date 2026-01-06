/**
 * runAssertions
 *
 * Applies a resolver test spec (from test.json) to a parsed resolver AST.
 *
 * Each assertion in the spec must have:
 * - id
 * - type
 * - severity
 * - (optional) message
 *
 * Supported types for now:
 * 1. assert_allowlist      → R-001
 * 2. assert_input_contract → R-002
 * 3. assert_output_contract→ R-002
 * 4. assert_failure_modes  → R-003
 */

export function runAssertions(testSpec, resolverAST) {
  if (!testSpec.assertions || testSpec.assertions.length === 0) {
    return { ok: true, message: "No assertions defined" };
  }

  const failures = [];

  for (const assertion of testSpec.assertions) {
    const { id, type, severity = "fatal", message } = assertion;

    let passed = false;

    switch (type) {
      case "assert_allowlist":
        passed = checkAllowlist(resolverAST);
        break;

      case "assert_input_contract":
        passed = checkInputContract(resolverAST);
        break;

      case "assert_output_contract":
        passed = checkOutputContract(resolverAST);
        break;

      case "assert_failure_modes":
        passed = checkFailureModes(resolverAST);
        break;

      default:
        // Unknown assertion type → fail by default
        passed = false;
    }

    if (!passed) {
      failures.push({
        id,
        severity,
        message: message || `Assertion failed: ${type}`
      });
    }
  }

  return {
    ok: failures.length === 0,
    message: failures.length === 0
      ? "All assertions passed"
      : failures.map(f => `${f.id}: ${f.message}`).join("; "),
    failures
  };
}

/**
 * Example: R-001 — allowlist check
 * Only allow certain AST node types (simplified)
 */
function checkAllowlist(ast) {
  const allowedNodes = ["action", "prompt", "persist", "emit", "use", "ask"];
  if (!ast.steps) return false;

  return ast.steps.every(step => allowedNodes.includes(step.type));
}

/**
 * Example: R-002 — input contract exists
 */
function checkInputContract(ast) {
  // Assume resolver has 'inputs' property
  return ast.inputs && Array.isArray(ast.inputs) && ast.inputs.length > 0;
}

/**
 * Example: R-002 — output contract exists
 */
function checkOutputContract(ast) {
  // Assume resolver has 'outputs' property
  return ast.outputs && Array.isArray(ast.outputs) && ast.outputs.length > 0;
}

/**
 * Example: R-003 — failure modes declared
 */
function checkFailureModes(ast) {
  // Assume resolver has 'failures' property
  return ast.failures && Array.isArray(ast.failures) && ast.failures.length > 0;
}
