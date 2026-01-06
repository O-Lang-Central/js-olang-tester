#!/usr/bin/env node
/**
 * O-Lang Resolver Test Runner
 *
 * Authoritative, locked execution entrypoint for resolver tests.
 * Mirrors kernel-test philosophy, but independent of any kernel.
 */

import fs from "fs";
import path from "path";
import { parse } from "./lib/parser.js"; // your resolver parser
import { runAssertions } from "./lib/runner.js"; // implements test.json rules

// ----------- CLI Argument Handling ----------- //
const resolverPath = process.argv[2];

if (!resolverPath) {
  console.error("Usage: node run.js <path-to-resolver.ol>");
  process.exit(1);
}

// ----------- Resolve Absolute Path ----------- //
const absResolverPath = path.resolve(resolverPath);

if (!fs.existsSync(absResolverPath)) {
  console.error(`Resolver file not found: ${absResolverPath}`);
  process.exit(1);
}

// ----------- Parse Resolver ----------- //
let resolverAST;
try {
  const source = fs.readFileSync(absResolverPath, "utf8");
  resolverAST = parse(source, absResolverPath);
} catch (err) {
  console.error("Failed to parse resolver:", err.message);
  process.exit(1);
}

// ----------- Locate Test Suites ----------- //
const rootDir = path.resolve("./resolver-tests");
const suites = fs.readdirSync(rootDir)
  .filter(name => name.match(/^R-\d+/))
  .sort();

if (suites.length === 0) {
  console.error("No resolver test suites found in resolver-tests/");
  process.exit(1);
}

// ----------- Run Test Suites ----------- //
let overallFailed = false;

for (const suiteName of suites) {
  const suitePath = path.join(rootDir, suiteName);
  const testJsonPath = path.join(suitePath, "test.json");
  const testResolverPath = path.join(suitePath, "resolver.ol");

  if (!fs.existsSync(testJsonPath) || !fs.existsSync(testResolverPath)) {
    console.warn(`Skipping ${suiteName}: missing test.json or resolver.ol`);
    continue;
  }

  let testSpec;
  try {
    testSpec = JSON.parse(fs.readFileSync(testJsonPath, "utf8"));
  } catch (err) {
    console.error(`Failed to load test.json in ${suiteName}: ${err.message}`);
    overallFailed = true;
    continue;
  }

  // Parse the resolver in this suite
  let suiteResolverAST;
  try {
    const resolverSource = fs.readFileSync(testResolverPath, "utf8");
    suiteResolverAST = parse(resolverSource, testResolverPath);
  } catch (err) {
    console.error(`Failed to parse resolver.ol in ${suiteName}: ${err.message}`);
    overallFailed = true;
    continue;
  }

  // Run the assertions
  const result = runAssertions(testSpec, suiteResolverAST);

  if (result.ok) {
    console.log(`✔ ${suiteName}`);
  } else {
    console.error(`✖ ${suiteName}: ${result.message}`);
    overallFailed = true;
  }
}

// ----------- Final Exit Code ----------- //
if (overallFailed) {
  console.error("\nResolver FAILED one or more tests");
  process.exit(1);
} else {
  console.log("\nResolver PASSED all tests!");
  process.exit(0);
}
