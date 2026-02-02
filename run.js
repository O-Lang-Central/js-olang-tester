#!/usr/bin/env node
console.log("🚀 Starting O-lang resolver test runner...");
const path = require("path");
const fs = require("fs");

// ----------------------
// Load resolver from env
// ----------------------
let resolverPath = process.env.OLANG_RESOLVER;

if (!resolverPath) {
  console.error("❌ OLANG_RESOLVER environment variable is not set");
  process.exit(1);
}

// Normalize relative paths
if (resolverPath.startsWith(".")) {
  resolverPath = path.resolve(process.cwd(), resolverPath);
}

// Verify resolver exists
if (!fs.existsSync(resolverPath)) {
  console.error(`❌ Resolver path does not exist: ${resolverPath}`);
  process.exit(1);
}

let resolver;
try {
  resolver = require(resolverPath);
} catch (err) {
  console.error(`❌ Failed to load resolver from ${resolverPath}`);
  console.error(err);
  process.exit(1);
}

// ----------------------
// CLI arg parsing
// ----------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    suites: [],
    json: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--suite" && args[i + 1]) {
      opts.suites.push(args[++i]);
    }
    if (args[i] === "--json") {
      opts.json = true;
    }
  }

  return opts;
}

// ----------------------
// Imports
// ----------------------
const { runAllTests } = require("./lib/runner");
const { generateBadge } = require("./lib/badge");

// ----------------------
// Main
// ----------------------
(async () => {
  try {
    const opts = parseArgs();

    const suites =
      opts.suites.length > 0
        ? opts.suites
        : [
        "R-005-resolver-metadata-contract",
        "R-006-resolver-runtime-shape",
        "R-007-resolver-failure-contract",
        "R-008-resolver-input-validation",
        "R-009-resolver-retry-semantics",
        "R-010-resolver-output-contract",
        "R-011-resolver-determinism",
        "R-012-resolver-side-effects",
        "R-013-resolver-kernel-bypass"
          ];

    const result = await runAllTests({
      suites,
      resolver
    });

    // ----------------------
    // Generate conformance report
    // ----------------------
    const conformanceReport = {
      resolver: resolver?.resolverDeclaration?.resolverName || resolver?.resolverName || "unknown",
      timestamp: new Date().toISOString(),
      results: suites.map(suite => ({
        suite,
        status: result.failed > 0 ? "fail" : "pass"
      }))
    };

    fs.writeFileSync(
      path.join(process.cwd(), "conformance.json"),
      JSON.stringify(conformanceReport, null, 2)
    );

    // ----------------------
// Generate certification badge
// ----------------------
const meta = resolver.resolverDeclaration || resolver;

console.log("🏷 Badge metadata being sent:", {
  resolverName: meta.resolverName,
  version: meta.version,
  passed: result.failed === 0,
  outputDir: process.cwd()
});

generateBadge({
  resolverName: meta.resolverName || "unknown-resolver",
  version: meta.version || "",
  passed: result.failed === 0,
  outputDir: process.cwd()
});

    // ----------------------
    // Output handling
    // ----------------------
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    }

    if (result.failed > 0) {
      console.error(`❌ ${result.failed} resolver test(s) failed`);
      console.error("❌ Resolver is NOT certified");
      process.exit(1);
    }

    console.log("✅ All resolver tests passed");
    console.log("🏅 Resolver is O-lang CERTIFIED");
    process.exit(0);

  } catch (err) {
    console.error("🔥 Resolver test runner crashed");
    console.error(err);
    process.exit(1);
  }
})();
