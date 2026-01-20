const path = require("path");
const fs = require("fs");

// ----------------------
// Helper: Deep get by path (e.g., "steps[0].saveAs")
// ----------------------
function getNestedValue(obj, path) {
  if (!path) return obj;
  return path
    .split(/\.(?![^\[]*\])|[\[\]]/)
    .filter(Boolean)
    .reduce((cur, prop) => cur?.[prop], obj);
}

// ----------------------
// Validator functions for WORKFLOW AST
// ----------------------
function checkAllowlist(ast, expected) {
  const allowed = ast.allowedResolvers || [];
  return (
    Array.isArray(allowed) &&
    allowed.length === expected.length &&
    expected.every(r => allowed.includes(r))
  );
}

function checkResolverNameNormalization(ast) {
  const allowed = ast.allowedResolvers || [];
  const pattern = /^[a-zA-Z][a-zA-Z0-9]*$/;
  return Array.isArray(allowed) && allowed.every(name => pattern.test(name));
}

function checkWorkflowName(ast, expected) {
  return ast.name === expected;
}

function checkReturnValues(ast, expected) {
  const returns = ast.returnValues || [];
  return (
    Array.isArray(returns) &&
    returns.length === expected.length &&
    expected.every(v => returns.includes(v))
  );
}

function checkNoWarnings(status, expectedCount = 0) {
  const warnings = status?.__warnings || [];
  return warnings.length === expectedCount;
}

function checkStepType(ast, assertion) {
  const steps = ast.steps || [];
  const step = steps[assertion.stepIndex];
  return step && step.type === assertion.expected;
}

function checkStepSaveAs(ast, assertion) {
  const steps = ast.steps || [];
  const step = steps[assertion.stepIndex];
  return step && step.saveAs === assertion.expected;
}

function checkStepFailurePolicies(ast, assertion) {
  const steps = ast.steps || [];
  const step = steps[assertion.stepIndex];
  if (!step || !step.failurePolicies) return false;

  const expected = assertion.expected;
  return Object.keys(expected).every(code => {
    const policy = step.failurePolicies[code];
    return (
      policy &&
      policy.action === expected[code].action &&
      policy.count === expected[code].count
    );
  });
}

function checkContainsWarning(status, assertion) {
  const warnings = status?.__warnings || [];
  const needle = assertion.expected_substring.toLowerCase();
  return warnings.some(w =>
    (typeof w === "string" ? w : w.message || "")
      .toLowerCase()
      .includes(needle)
  );
}

function checkStatusGreaterThan(status, assertion) {
  const value = getNestedValue(status, assertion.path);
  return typeof value === "number" && value > assertion.expected;
}

// ----------------------
// Validator functions for RESOLVER METADATA (R-005)
// ----------------------
function checkResolverHasField(resolverMeta, assertion) {
  return resolverMeta[assertion.field] === assertion.expected;
}

function checkResolverInputsValid(resolverMeta) {
  const inputs = resolverMeta.inputs;
  return (
    Array.isArray(inputs) &&
    inputs.every(
      i =>
        i &&
        typeof i.name === "string" &&
        typeof i.type === "string" &&
        typeof i.required === "boolean"
    )
  );
}

function checkResolverOutputsValid(resolverMeta) {
  const outputs = resolverMeta.outputs;
  return (
    Array.isArray(outputs) &&
    outputs.every(
      o =>
        o &&
        typeof o.name === "string" &&
        typeof o.type === "string"
    )
  );
}

function checkFieldNamesNormalized(resolverMeta, assertion) {
  const items = resolverMeta[assertion.field] || [];
  const pattern = /^[a-zA-Z][a-zA-Z0-9_]*$/;
  return Array.isArray(items) && items.every(item => pattern.test(item.name));
}

function checkResolverFailuresValid(resolverMeta) {
  const failures = resolverMeta.failures;
  if (!failures) return false;

  return (
    Array.isArray(failures) &&
    failures.every(
      f =>
        f &&
        typeof f.code === "string" &&
        typeof f.retries === "number"
    )
  );
}

// ----------------------
// Assertion handler registry
// ----------------------
const assertionHandlers = {
  // Workflow AST assertions
  allowed_resolvers_listed: (ast, assertion) =>
    checkAllowlist(ast, assertion.expected),

  resolver_names_normalized: ast =>
    checkResolverNameNormalization(ast),

  workflow_name_present: (ast, assertion) =>
    checkWorkflowName(ast, assertion.expected),

  workflow_return_values: (ast, assertion) =>
    checkReturnValues(ast, assertion.expected),

  workflow_return_values_empty: (ast, assertion) =>
    checkReturnValues(ast, assertion.expected),

  no_parse_warnings: (ast, assertion, status) =>
    checkNoWarnings(status, assertion.expected),

  step_type: (ast, assertion) =>
    checkStepType(ast, assertion),

  step_saveas: (ast, assertion) =>
    checkStepSaveAs(ast, assertion),

  step_failure_policies: (ast, assertion) =>
    checkStepFailurePolicies(ast, assertion),

  // Negative test assertions (R-004)
  contains_warning: (ast, assertion, status) =>
    checkContainsWarning(status, assertion),

  status_greater_than: (ast, assertion, status) =>
    checkStatusGreaterThan(status, assertion),

  // Resolver metadata assertions (R-005)
  resolver_has_field: (resolverMeta, assertion) =>
    checkResolverHasField(resolverMeta, assertion),

  resolver_inputs_valid: resolverMeta =>
    checkResolverInputsValid(resolverMeta),

  resolver_outputs_valid: resolverMeta =>
    checkResolverOutputsValid(resolverMeta),

  field_names_normalized: (resolverMeta, assertion) =>
    checkFieldNamesNormalized(resolverMeta, assertion),

  resolver_failures_valid: resolverMeta =>
    checkResolverFailuresValid(resolverMeta),
};

// ----------------------
// Main assertion runner
// ----------------------
function runAssertions(testSpec, target, status = {}) {
  if (!testSpec.assertions?.length) {
    return { ok: true, message: "No assertions defined" };
  }

  const failures = [];

  for (const assertion of testSpec.assertions) {
    const { id, type, severity = "fatal", description } = assertion;
    let passed = false;

    if (type in assertionHandlers) {
      passed = assertionHandlers[type](target, assertion, status);
    } else {
      failures.push({
        id,
        severity,
        message: `Unknown assertion type: ${type}`,
      });
      continue;
    }

    if (!passed) {
      failures.push({
        id,
        severity,
        message: description || `Assertion failed: ${id}`,
      });
    }
  }

  return {
    ok: failures.length === 0,
    message:
      failures.length === 0
        ? "All assertions passed"
        : failures
            .map(f => `[${f.severity}] ${f.id}: ${f.message}`)
            .join("; "),
    failures,
  };
}

// ----------------------
// Test suite executor
// ----------------------
async function runAllTests({ suites, resolver }) {
  let failed = 0;
  // Resolve test suites from the package root (where R-001-..., R-005-... live)
  const PACKAGE_ROOT = path.join(__dirname, '..');

  for (const suite of suites) {
    const suiteDir = path.join(PACKAGE_ROOT, suite);
    const testSpecPath = path.join(suiteDir, "test.json");

    if (!fs.existsSync(testSpecPath)) {
      console.error(`❌ Test spec not found: ${testSpecPath}`);
      failed++;
      continue;
    }

    const testSpec = JSON.parse(fs.readFileSync(testSpecPath, "utf8"));
    let target;
    let status = {};

    const fixture = testSpec.fixtures.inputs[0];

    if (fixture.workflow) {
      // Workflow parsing test (R-001 → R-004)
      const workflowPath = path.join(suiteDir, fixture.workflow);
      if (!fs.existsSync(workflowPath)) {
        console.error(`❌ Workflow file missing: ${workflowPath}`);
        failed++;
        continue;
      }

      const workflowSource = fs.readFileSync(workflowPath, "utf8");
      try {
        const parseResult = resolver.parse
          ? resolver.parse(workflowSource)
          : { ast: resolver };

        target = parseResult.ast;
        status = { __warnings: parseResult.__warnings || [] };
      } catch (err) {
        console.error(`❌ Parse failed for ${suite}:`, err.message);
        failed++;
        continue;
      }
    } else if (fixture.resolver_contract) {
      // Resolver metadata test (R-005)
      const contractPath = path.join(suiteDir, fixture.resolver_contract);
      if (!fs.existsSync(contractPath)) {
        console.error(`❌ Resolver contract missing: ${contractPath}`);
        failed++;
        continue;
      }

      try {
        target = require(contractPath);
      } catch (err) {
        console.error(
          `❌ Failed to load resolver contract ${suite}:`,
          err.message
        );
        failed++;
        continue;
      }
    } else {
      console.error(`❌ Unrecognized fixture in ${suite}`);
      failed++;
      continue;
    }

    const result = runAssertions(testSpec, target, status);

    if (!result.ok) {
      console.error(`❌ ${suite} failed: ${result.message}`);
      failed++;
    } else {
      console.log(`✅ ${suite} passed`);
    }
  }

  return { failed };
}

module.exports = {
  runAssertions,
  runAllTests,
};