export type TemplateTypes =
  | "reconciliationText"
  | "sharedPart"
  | "exportFile"
  | "accountTemplate";

export type MainTemplateTypes = Exclude<TemplateTypes, "sharedPart">;

export type TemplatePartType = "main" | "textPart" | "sharedPart";

/**
 * Represents a section of a template part during execution.
 *
 * Terminology clarification:
 * - Template Part: The actual file (main.liquid, text part file, or shared part file)
 * - Part Section: A continuous section of a template part file
 *
 * Why sections exist:
 * When a template part contains include statements, it gets split into multiple sections.
 * Each section represents the lines before/after an include statement.
 *
 * Example:
 * main.liquid (lines 0-20) with includes at lines 5 and 15 becomes 3 sections:
 *   - Section 0: main.liquid lines 0-4   (before first include)
 *   - Section 1: included_file.liquid    (the include)
 *   - Section 2: main.liquid lines 6-14  (between includes)
 *   - Section 3: another_include.liquid  (the include)
 *   - Section 4: main.liquid lines 16-20 (after last include)
 *
 * This allows tracking template execution order while maintaining precise line ranges.
 */
export interface TemplatePartSection {
  fileFullPath: string;
  type: TemplatePartType;
  name: string;
  startLine: number; // 0-based, inclusive
  endLine: number; // 0-based, inclusive
}

export type TemplatePartSections = TemplatePartSection[];

/**
 * Complete template map containing both execution order and file tracking.
 *
 * Performance optimization:
 * - partSections: Ordered list of sections for execution tracking (can be 222+ sections)
 * - involvedFiles: Unique list of files used (e.g., 20 files)
 *
 * This allows parsing each unique file once (20 parses) instead of parsing
 * each section separately (222 parses), then sorting results by section order.
 */
export interface TemplateMap {
  partSections: TemplatePartSection[];
  involvedFiles: string[]; // Unique file paths in order of first appearance
}

/**
 * Result of looking up a template map by URI and position.
 * Includes the template map and the current execution index.
 */
export interface TemplateMapContext {
  templateMap: TemplateMap;
  currentFileIndex: number;
}

export type TemplateKey = `${TemplateTypes}/${string}`; // e.g., "reconciliationText/handle"

export type TemplateCollection = Map<TemplateKey, TemplateMap>;

// Template directories relative to workspace root
// Type > directory
export enum TemplateDirectories {
  reconciliationText = "reconciliation_texts",
  sharedPart = "shared_parts",
  exportFile = "export_files",
  accountTemplate = "account_templates",
}

export interface TemplateUriInfo {
  templateType: TemplateTypes;
  templateName: string;
  partType: TemplatePartType;
  partName: string;
  fullPath: string;
}

/**
 * Configuration for text parts path mappings
 * Maps part name to relative path from template directory
 */
export interface TextPartsConfig {
  [partName: string]: string;
}

/**
 * Template configuration from config.json
 */
export interface TemplateConfig {
  text_parts?: TextPartsConfig;
}
