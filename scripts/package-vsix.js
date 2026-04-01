"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const childProcess = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const extensionName = `${packageJson.name}-${packageJson.version}.vsix`;
const outputPath = path.join(rootDir, extensionName);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-optimizer-vsix-"));
const extensionDir = path.join(tempDir, "extension");

fs.mkdirSync(extensionDir, { recursive: true });

copyIntoExtension("package.json");
copyIntoExtension("README.md");
copyIntoExtension(".gitignore");
copyIntoExtension(".vscode/launch.json");
copyTree("dist");

writeFile(path.join(tempDir, "[Content_Types].xml"), buildContentTypesXml());
writeFile(path.join(tempDir, "extension.vsixmanifest"), buildVsixManifest(packageJson));

if (fs.existsSync(outputPath)) {
  fs.rmSync(outputPath, { force: true });
}

childProcess.execFileSync(
  "zip",
  ["-qr", outputPath, "extension", "[Content_Types].xml", "extension.vsixmanifest"],
  { cwd: tempDir, stdio: "inherit" }
);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log(`Created ${outputPath}`);

function copyIntoExtension(relativePath) {
  const source = path.join(rootDir, relativePath);
  const destination = path.join(extensionDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyTree(relativePath) {
  const sourceRoot = path.join(rootDir, relativePath);
  const destinationRoot = path.join(extensionDir, relativePath);
  fs.mkdirSync(destinationRoot, { recursive: true });

  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const source = path.join(sourceRoot, entry.name);
    const destination = path.join(destinationRoot, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destination, { recursive: true });
      copyTree(path.join(relativePath, entry.name));
    } else {
      fs.copyFileSync(source, destination);
    }
  }
}

function writeFile(filePath, contents) {
  fs.writeFileSync(filePath, contents, "utf8");
}

function buildContentTypesXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '  <Default Extension="json" ContentType="application/json" />',
    '  <Default Extension="js" ContentType="application/javascript" />',
    '  <Default Extension="md" ContentType="text/markdown" />',
    '  <Default Extension="xml" ContentType="application/xml" />',
    '  <Override PartName="/extension.vsixmanifest" ContentType="text/xml" />',
    '</Types>'
  ].join("\n");
}

function buildVsixManifest(pkg) {
  const packageBytes = fs.readFileSync(path.join(rootDir, "package.json"));
  const packageHash = crypto.createHash("sha256").update(packageBytes).digest("base64");

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">',
    `  <Metadata>`,
    `    <Identity Language="en-US" Id="${pkg.publisher}.${pkg.name}" Version="${pkg.version}" Publisher="${escapeXml(pkg.publisher)}" />`,
    `    <DisplayName>${escapeXml(pkg.displayName)}</DisplayName>`,
    `    <Description xml:space="preserve">${escapeXml(pkg.description)}</Description>`,
    `    <Tags>prompt optimizer ai chatgpt cursor codex claude gemini deepseek</Tags>`,
    '  </Metadata>',
    '  <Installation>',
    '    <InstallationTarget Id="Microsoft.VisualStudio.Code" />',
    '  </Installation>',
    '  <Dependencies />',
    '  <Assets>',
    '    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />',
    '    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />',
    '  </Assets>',
    '  <Properties>',
    `    <Property Id="Microsoft.VisualStudio.Services.Content.SHA256" Value="${packageHash}" />`,
    '  </Properties>',
    '</PackageManifest>'
  ].join("\n");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
