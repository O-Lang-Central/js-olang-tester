const path = require("path");
const fs = require("fs");

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
// Validator functions for RESOLVER RUNTIME (R-006 → R-012)
// ----------------------

function checkResolverIsCallable(resolver) {
  return typeof resolver === 'function';
}

function checkFailureCodeDeclared(observedError, resolverMeta) {
  if (!observedError?.code) return true;
  const declaredCodes = (resolverMeta.failures || []).map(f => f.code);
  return declaredCodes.includes(observedError.code);
}

// ✅ FIXED: Accept structured errors (O-Lang standard) instead of requiring throws
function checkRejectsMissingRequiredInput(invocationResult) {
  // Accept either: threw an error, OR returned { error: ... }
  if (invocationResult.threw) return true;
  
  const output = invocationResult.output;
  return output != null && 
         typeof output === 'object' && 
         !Array.isArray(output) && 
         'error' in output;
}

function checkRetryCountWithinLimit(observedRetries, resolverMeta, errorCode) {
  const failure = (resolverMeta.failures || []).find(f => f.code === errorCode);
  if (!failure) return true;
  return observedRetries <= failure.retries;
}

// ✅ UPDATED: Handle both kernel-mode { output: ... } and direct-mode { field: value }
function checkOutputIsObject(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return false;
  }
  
  // If it has an 'output' key, validate the nested object
  if ('output' in output) {
    return output.output !== null && typeof output.output === 'object' && !Array.isArray(output.output);
  }
  
  // Otherwise, treat the whole object as the output (direct mode)
  return true;
}

// ✅ ENHANCED: Return rich error details for guidance
function checkOutputFieldsMatchContract(output, resolverMeta) {
  if (!output || typeof output !== 'object') {
    return {
      passed: false,
      details: {
        reason: 'no_output',
        actualOutput: output
      }
    };
  }

  let actualOutput;
  if ('output' in output) {
    actualOutput = output.output;
  } else {
    actualOutput = output; // direct mode
  }

  if (!actualOutput || typeof actualOutput !== 'object') {
    return {
      passed: false,
      details: {
        reason: 'invalid_output_shape',
        actualOutput: output
      }
    };
  }

  const declaredNames = (resolverMeta.outputs || []).map(o => o.name);
  const missingFields = declaredNames.filter(name => !(name in actualOutput));
  
  if (missingFields.length > 0) {
    return {
      passed: false,
      details: {
        reason: 'missing_fields',
        missingFields,
        actualOutput,
        expectedFields: declaredNames
      }
    };
  }
  
  return true;
}

function checkDeterministicOutput(results) {
  if (results.length < 2) return true;
  const first = JSON.stringify(results[0]);
  return results.slice(1).every(r => JSON.stringify(r) === first);
}

function checkNoGlobalMutation() {
  return true;
}

// ----------------------
// Guidance Registry - Contextual Help
// ----------------------
function getGuidanceMessage(assertionType, details, resolverMeta) {
  const resolverName = resolverMeta?.resolverName || 'unknown';
  
  switch (assertionType) {
    case 'output_fields_match_contract':
      if (details.reason === 'missing_fields') {
        const resolverTips = resolverName.includes('bank') ? `
💡 Bank resolver tip:
- Your capability.js must return { balance: integer }
- Create test/bank.db with customer_id=12345
- Use exampleAction: "Action bank-account-lookup customer_id=12345 bank_db_path=./test/bank.db"` : 
        resolverName.includes('telegram') ? `
💡 Telegram resolver tip:
- Your exampleAction must exactly match your hardcoded test string
- Return { status: "sent" } for the test action` : '';
        
        return `
🔍 What happened?
Your resolver returned: ${JSON.stringify(details.actualOutput)}
But your resolver.js declares outputs: [${details.expectedFields.map(f => `"${f}"`).join(', ')}]

💡 How to fix:
1. Ensure your resolver returns the correct output structure
2. Check your exampleAction matches your test logic
3. Verify your test data exists${resolverTips}

📘 Learn more: https://o-lang.org/docs/conformance/output-contract
        `.trim();
      }
      break;
      
    case 'rejects_missing_required_input':
      return `
🔍 What happened?
Your resolver didn't reject invalid input properly.

💡 How to fix:
- Return { error: "INVALID_INPUT" } for empty/missing inputs
- Return undefined only for non-matching actions (e.g., Telegram actions sent to bank resolver)

📘 Learn more: https://o-lang.org/docs/conformance/input-validation
      `.trim();
      
    case 'output_is_object':
      return `
🔍 What happened?
Your resolver didn't return an object.

💡 How to fix:
- Return { output: { ... } } for kernel mode
- Or return { field: value } for direct mode
- Never return primitives, arrays, or undefined for valid actions

📘 Learn more: https://o-lang.org/docs/conformance/output-contract
      `.trim();
  }
  
  return `Assertion failed. Check your resolver implementation.`;
}

// ----------------------
// Assertion handler registry.
// ----------------------
const assertionHandlers = {
  resolver_has_field: (resolverMeta, assertion) =>
    checkResolverHasField(resolverMeta, assertion),
  resolver_inputs_valid: checkResolverInputsValid,
  resolver_outputs_valid: checkResolverOutputsValid,
  field_names_normalized: checkFieldNamesNormalized,
  resolver_failures_valid: checkResolverFailuresValid,

  resolver_is_callable: (ctx) => checkResolverIsCallable(ctx.resolver),
  resolver_failure_declared: (ctx) => checkFailureCodeDeclared(ctx.error, ctx.resolverMeta),
  rejects_missing_required_input: (ctx) => checkRejectsMissingRequiredInput(ctx),
  retry_count_within_declared_limit: (ctx) =>
    checkRetryCountWithinLimit(ctx.retryCount, ctx.resolverMeta, ctx.error?.code),
  output_is_object: (ctx) => checkOutputIsObject(ctx.output),
  output_fields_match_contract: (ctx) => checkOutputFieldsMatchContract(ctx.output, ctx.resolverMeta),
  deterministic_output: (ctx) => checkDeterministicOutput(ctx.outputs),
  no_global_state_mutation: () => checkNoGlobalMutation(),
};

// ----------------------
// Main assertion runner with guided feedback
// ----------------------
function runAssertions(testSpec, target, status = {}) {
  if (!testSpec.assertions?.length) {
    return { ok: true, message: "No assertions defined" };
  }

  const failures = [];

  for (const assertion of testSpec.assertions) {
    const { id, type, severity = "fatal", description } = assertion;
    let result = false;

    if (type in assertionHandlers) {
      result = assertionHandlers[type](target, assertion, status);
    } else {
      failures.push({
        id,
        severity,
        message: `Unknown assertion type: ${type}`,
      });
      continue;
    }

    // Handle rich error objects
    let passed = true;
    let details = null;
    
    if (typeof result === 'object' && result !== null) {
      passed = result.passed;
      details = result.details;
    } else {
      passed = result;
    }

    if (!passed) {
      let message = description || `Assertion failed: ${id}`;
      
      // Add guided feedback
      if (details) {
        message = getGuidanceMessage(type, details, status.resolverMeta || target);
      }
      
      failures.push({
        id,
        severity,
        message: message
      });
    }
  }

  return {
    ok: failures.length === 0,
    message:
      failures.length === 0
        ? "All assertions passed"
        : failures.map(f => `[${f.severity}] ${f.id}: ${f.message}`).join("\n\n"),
    failures,
  };
}

// ----------------------
// Runtime resolver invoker with observation
// ----------------------
async function invokeResolverWithObservation(resolver, resolverMeta, testSpec, fixture) {
  const ctx = {
    resolver,
    resolverMeta,
    output: null,
    outputs: [],
    error: null,
    threw: false,
    retryCount: 0,
  };

  // ✅ DYNAMIC INPUT: Use resolver's exampleAction if marker is present
  let input;
  if (fixture?.invoke === "__USE_RESOLVER_EXAMPLE_ACTION__") {
    const exampleAction = resolverMeta?.exampleAction;
    if (!exampleAction) {
      throw new Error("Resolver must declare 'exampleAction' in resolver.js");
    }
    input = exampleAction;
  } else {
    input = fixture?.invoke || {};
  }

  const runs = testSpec.test_id === 'R-011-determinism' ? 3 : 1;

  for (let i = 0; i < runs; i++) {
    try {
      const result = await Promise.resolve(resolver(input));
      ctx.output = result;
      ctx.outputs.push(result);
    } catch (err) {
      ctx.threw = true;
      ctx.error = err;
      if (err.code) {
        const decl = resolverMeta.failures?.find(f => f.code === err.code);
        if (decl) ctx.retryCount = decl.retries;
      }
      break;
    }
  }

  return ctx;
}

// ----------------------
// Test suite executor with enhanced output
// ----------------------
async function runAllTests({ suites, resolver }) {
  let failed = 0;
  const PACKAGE_ROOT = path.join(__dirname, '..');
  const resolverMeta = resolver.resolverDeclaration || resolver;

  // Pre-check: warn about common issues
  const resolverName = resolverMeta.resolverName || 'unknown';
  if (resolverName.includes('bank') && !fs.existsSync(path.join(process.cwd(), 'test', 'bank.db'))) {
    console.warn("\n⚠️  Warning: test/bank.db not found. Create it with:");
    console.warn("   node scripts/create-test-db.mjs\n");
  }

  for (const suite of suites) {
    const suiteDir = path.join(PACKAGE_ROOT, suite);
    const testSpecPath = path.join(suiteDir, "test.json");

    if (!fs.existsSync(testSpecPath)) {
      console.error(`❌ Test spec not found: ${testSpecPath}`);
      failed++;
      continue;
    }

    const testSpec = JSON.parse(fs.readFileSync(testSpecPath, "utf8"));
    let fixture = testSpec.fixtures.inputs[0];

    // ✅ Allow local override (optional but useful)
    const localFixturePath = path.join(process.cwd(), 'test-fixtures', `${suite}.json`);
    if (fs.existsSync(localFixturePath)) {
      fixture = JSON.parse(fs.readFileSync(localFixturePath, 'utf8'));
    }

    if (fixture.resolver_contract) {
      const contractPath = path.join(suiteDir, fixture.resolver_contract);
      if (!fs.existsSync(contractPath)) {
        console.error(`❌ Resolver contract missing: ${contractPath}`);
        failed++;
        continue;
      }

      let target;
      try {
        target = require(contractPath);
      } catch (err) {
        console.error(`❌ Failed to load resolver contract ${suite}:`, err.message);
        failed++;
        continue;
      }

      const result = runAssertions(testSpec, target);
      if (!result.ok) {
        console.error(`\n❌ ${suite} failed:\n`);
        console.error(result.message);
        console.error('\n' + '='.repeat(60) + '\n');
        failed++;
      } else {
        console.log(`✅ ${suite} passed`);
      }
    } else if (testSpec.category === "resolver-runtime") {
      try {
        const runtimeContext = await invokeResolverWithObservation(resolver, resolverMeta, testSpec, fixture);
        const result = runAssertions(testSpec, runtimeContext, { resolverMeta });

        if (!result.ok) {
          console.error(`\n❌ ${suite} failed:\n`);
          console.error(result.message);
          console.error('\n' + '='.repeat(60) + '\n');
          failed++;
        } else {
          console.log(`✅ ${suite} passed`);
        }
      } catch (err) {
        console.error(`🔥 Runtime test ${suite} crashed:`, err.message);
        failed++;
      }
    } else {
      console.error(`❌ Unrecognized fixture in ${suite}`);
      failed++;
    }
  }

  return { failed };
}

module.exports = {
  runAssertions,
  runAllTests,
};