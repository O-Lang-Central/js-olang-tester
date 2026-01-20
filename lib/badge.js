const fs = require("fs");
const path = require("path");
console.log("✅ O-lang badge generator loaded");

// ----------------------
// Resolver-specific badge generator with O-lang tag
// ----------------------
function generateBadge({
  resolverName = "Unknown",
  version = "",
  passed = false,
  outputDir = process.cwd() // default to where CLI is run
}) {
  const color = passed ? "green" : "red";
  const statusText = passed ? "Certified" : "Failed";
  const versionText = version ? ` v${version}` : "";
  const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // O-lang tag (explicit branding)
  const badgeText = `O-lang | ${resolverName}${versionText} — ${statusText} (${timestamp})`;

  const width = 20 + badgeText.length * 7; // approximate width per character

  const badgeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20">
  <rect width="${width}" height="20" fill="${color}" rx="3" ry="3"/>
  <text x="${width / 2}" y="14"
        fill="#fff"
        font-family="Verdana"
        font-size="12"
        text-anchor="middle">
    ${badgeText}
  </text>
</svg>
`.trim();

  // ----------------------
  // Ensure badges folder exists
  // ----------------------
  const badgesDir = path.join(outputDir, "badges");
  if (!fs.existsSync(badgesDir)) {
    fs.mkdirSync(badgesDir, { recursive: true });
  }

  // ----------------------
  // Write badge file
  // ----------------------
  const safeName = resolverName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const badgePath = path.join(badgesDir, `${safeName}-badge.svg`);

  fs.writeFileSync(badgePath, badgeSvg, "utf8");

  console.log(`🏷 Badge written to ${badgePath}`);

  return badgePath;
}

// ----------------------
// Export
// ----------------------
module.exports = {
  generateBadge
};
