/**
 * Debug Script: List All Template Parts Maps
 *
 * This script lists the template parts map for templates.
 * It shows the exact order of parts, their line ranges, and helps understand how includes are resolved.
 *
 * Usage:
 *   npm run build
 *
 *   # Analyze all templates in fixtures/market-repo
 *   node out/scripts/listAllTemplatePartsMaps.js
 *
 *   # Analyze all templates in a specific directory
 *   node out/scripts/listAllTemplatePartsMaps.js /path/to/templates/root
 *
 *   # Analyze a specific template
 *   node out/scripts/listAllTemplatePartsMaps.js /path/to/template/main.liquid
 */

import { TemplatePartsCollectionManager } from "../templates/templatePartsCollectionManager";
import { URI } from "vscode-uri";
import * as path from "path";
import * as fs from "fs";

interface TemplateInfo {
  type: string;
  name: string;
  path: string;
}

function parseArguments(): {
  mode: "all" | "directory" | "single";
  path: string;
} {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Default: analyze all templates in fixtures
    return {
      mode: "all",
      path: path.resolve(__dirname, "../../fixtures/market-repo"),
    };
  }

  const targetPath = path.resolve(args[0]);

  // Check if it's a file
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    return {
      mode: "single",
      path: targetPath,
    };
  }

  // Check if it's a directory
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    return {
      mode: "directory",
      path: targetPath,
    };
  }

  console.error(`Error: Path does not exist: ${targetPath}`);
  process.exit(1);
}

async function getAllTemplates(rootPath: string): Promise<TemplateInfo[]> {
  const templates: TemplateInfo[] = [];

  const templateTypes = [
    { type: "reconciliation_texts", displayName: "Reconciliation Text" },
    { type: "export_files", displayName: "Export File" },
    { type: "account_templates", displayName: "Account Template" },
  ];

  for (const templateType of templateTypes) {
    const typeDir = path.join(rootPath, templateType.type);

    if (!fs.existsSync(typeDir)) {
      continue;
    }

    const templateDirs = fs
      .readdirSync(typeDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const templateName of templateDirs) {
      const mainPath = path.join(typeDir, templateName, "main.liquid");

      if (fs.existsSync(mainPath)) {
        templates.push({
          type: templateType.displayName,
          name: templateName,
          path: mainPath,
        });
      }
    }
  }

  return templates.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.name.localeCompare(b.name);
  });
}

function getPartType(fullPath: string): string {
  const basename = path.basename(fullPath);
  const parentDir = path.basename(path.dirname(fullPath));

  if (basename === "main.liquid") {
    return "main";
  } else if (parentDir === "text_parts") {
    return "text_part";
  } else if (
    parentDir === "shared_parts" ||
    fullPath.includes("/shared_parts/")
  ) {
    return "shared_part";
  } else {
    return "text_part"; // Default for included files
  }
}

async function analyzeTemplate(templatePath: string, workspaceRoot: string) {
  const manager = TemplatePartsCollectionManager.getInstance(workspaceRoot);

  try {
    const result = await manager.getMapAndIndexFromUri(
      URI.file(templatePath).toString(),
      0,
    );

    if (!result) {
      return {
        success: false,
        error: "Template map returned null",
        parts: [],
      };
    }

    const parts = result.templateMap.partSections.map((part, index) => ({
      index,
      file: path.basename(part.fileFullPath),
      fullPath: part.fileFullPath,
      type: getPartType(part.fileFullPath),
      startLine: part.startLine,
      endLine: part.endLine,
      lineCount: part.endLine - part.startLine + 1,
      isCurrent: index === result.currentFileIndex,
    }));

    return {
      success: true,
      parts,
      currentIndex: result.currentFileIndex,
      totalParts: result.templateMap.partSections.length,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      parts: [],
    };
  }
}

async function analyzeSingleTemplate(
  templatePath: string,
  workspaceRoot: string,
) {
  console.log("=".repeat(80));
  console.log("TEMPLATE PARTS MAP - SINGLE TEMPLATE");
  console.log("=".repeat(80));
  console.log();
  console.log(`Template: ${templatePath}`);
  console.log(`Workspace root: ${workspaceRoot}`);
  console.log();

  const analysis = await analyzeTemplate(templatePath, workspaceRoot);

  if (!analysis.success) {
    console.log(`❌ ERROR: ${analysis.error}`);
    console.log();
    console.log("Make sure:");
    console.log("  1. The template path is correct");
    console.log(
      "  2. The workspace root contains reconciliation_texts/, export_files/, or account_templates/",
    );
    console.log(
      "  3. You may need to specify the workspace root explicitly if auto-detection fails",
    );
    return;
  }

  console.log(`Total parts: ${analysis.totalParts}`);
  console.log(`Current part index: ${analysis.currentIndex}`);
  console.log();
  console.log("Parts order:");
  console.log(
    "  Idx | File                                           | Type         | Lines       | Cur",
  );
  console.log("  " + "-".repeat(95));

  analysis.parts.forEach((part) => {
    const idx = String(part.index).padStart(3);
    // Truncate long filenames with ellipsis
    let file = part.file;
    if (file.length > 46) {
      file = "..." + file.slice(-43);
    }
    file = file.padEnd(46);
    const type = part.type.padEnd(12);
    const lines = `${String(part.startLine).padStart(4)}-${String(part.endLine).padEnd(4)}`;
    const current = part.isCurrent ? " <--" : "";

    console.log(`  ${idx} | ${file} | ${type} | ${lines} |${current}`);
  });
}

function findWorkspaceRoot(templatePath: string): string {
  // Try to find the workspace root by looking for template type directories
  let current = path.dirname(templatePath);

  // Keep going up until we find a directory containing template types
  while (current !== path.dirname(current)) {
    // Root reached
    const hasReconciliationTexts = fs.existsSync(
      path.join(current, "reconciliation_texts"),
    );
    const hasExportFiles = fs.existsSync(path.join(current, "export_files"));
    const hasAccountTemplates = fs.existsSync(
      path.join(current, "account_templates"),
    );

    if (hasReconciliationTexts || hasExportFiles || hasAccountTemplates) {
      return current;
    }

    current = path.dirname(current);
  }

  // Fallback: use the parent directory of the template
  return path.dirname(path.dirname(templatePath));
}

async function main() {
  const config = parseArguments();

  if (config.mode === "single") {
    // Analyze a single template file
    const workspaceRoot = findWorkspaceRoot(config.path);
    await analyzeSingleTemplate(config.path, workspaceRoot);
    return;
  }

  // Analyze all templates in a directory
  console.log("=".repeat(80));
  console.log("TEMPLATE PARTS MAPS");
  console.log("=".repeat(80));
  console.log();
  console.log(`Analyzing templates in: ${config.path}`);
  console.log();
  console.log(
    "This shows how each template is split into parts based on includes.",
  );
  console.log(
    "Files can appear multiple times when they have content before/after includes.",
  );
  console.log();

  const templates = await getAllTemplates(config.path);

  console.log(`Found ${templates.length} templates\n`);

  let currentType = "";

  for (const template of templates) {
    if (template.type !== currentType) {
      currentType = template.type;
      console.log("\n" + "=".repeat(80));
      console.log(`${currentType.toUpperCase()}`);
      console.log("=".repeat(80));
    }

    console.log(`\n--- ${template.name} ---`);
    console.log();
    console.log(`Path: ${path.relative(config.path, template.path)}`);

    const analysis = await analyzeTemplate(template.path, config.path);

    if (!analysis.success) {
      console.log(`❌ ERROR: ${analysis.error}`);
      continue;
    }

    console.log(`Total parts: ${analysis.totalParts}`);
    console.log(
      `Current part index when opening main.liquid: ${analysis.currentIndex}`,
    );
    console.log();
    console.log("Parts order:");
    console.log(
      "  Idx | File                                           | Type         | Lines       | Cur",
    );
    console.log("  " + "-".repeat(95));

    analysis.parts.forEach((part) => {
      const idx = String(part.index).padStart(3);
      // Truncate long filenames with ellipsis
      let file = part.file;
      if (file.length > 46) {
        file = "..." + file.slice(-43);
      }
      file = file.padEnd(46);
      const type = part.type.padEnd(12);
      const lines = `${String(part.startLine).padStart(4)}-${String(part.endLine).padEnd(4)}`;
      const current = part.isCurrent ? " <--" : "";

      console.log(`  ${idx} | ${file} | ${type} | ${lines} |${current}`);
    });
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total templates analyzed: ${templates.length}`);
  console.log();
  console.log("Key insights:");
  console.log("  - Parts are listed in execution order");
  console.log(
    "  - Files may appear multiple times if they have includes in the middle",
  );
  console.log("  - Line ranges show which lines of each file are in each part");
  console.log("  - 'Current' marks where the cursor is when opening that file");
  console.log();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
