import { Logger } from "../logger";
import * as fs from "fs";
import * as path from "path";
import { IncludeParser } from "../liquid/includeParser";
import { ConfigReader } from "./configReader";
import {
  TemplateTypes,
  TemplatePartSections,
  TemplatePartType,
  TemplateDirectories,
  TemplateMap,
} from "./types";
import { IncludeTagInfo } from "../liquid/types";

/**
 * Class to map out the parts of a Liquid template, including main, text parts, and shared parts.
 * It processes the main template and recursively resolves includes to build an ordered list of template parts.
 * Each part includes its type, name, and line range within the overall template structure.
 * Returns an ordered array of template parts with their line ranges.
 *
 * @example
 * const mapper = new TemplatePartsMapper(workspaceRoot);
 * const templateMap = mapper.generateTemplateMap('reconciliationText', 'reconciliation_handle');
 * console.log(templateMap);
 * // Output:
 * [
 *   { type: 'main', name: 'main', startLine: 0, endLine: 10 },
 *   { type: 'textPart', name: 'greeting', startLine: 1, endLine: 20 },
 *   { type: 'main', name: 'main', startLine: 11, endLine: 16 },
 *   { type: 'sharedPart', name: 'footer', startLine: 1, endLine: 12 },
 *   { type: 'main', name: 'main', startLine: 17, endLine: 25 },
 * ]
 */
export class TemplatePartsMapper {
  private logger: Logger = new Logger("TemplatePartsMapper");
  private workspaceRoot!: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  public generateTemplateMap(
    templateType: TemplateTypes,
    templateName: string,
  ): TemplateMap | null {
    const orderedPartSections: TemplatePartSections = [];

    const templateDir = path.join(
      this.workspaceRoot,
      TemplateDirectories[templateType],
      templateName,
    );
    if (!fs.existsSync(templateDir)) {
      this.logger.warn(`Template directory does not exist: ${templateDir}`);
      return null;
    }

    const mainTemplatePath = path.join(templateDir, "main.liquid");

    if (!fs.existsSync(mainTemplatePath)) {
      this.logger.warn(`Main template does not exist: ${mainTemplatePath}`);
      return null;
    }

    // Start recursive processing with main template
    const processedFiles = new Set<string>(); // Prevent circular includes
    this.processLiquidFileRecursively(
      mainTemplatePath,
      "main",
      "main",
      templateDir,
      orderedPartSections,
      processedFiles,
    );

    // Extract unique file paths in order of first appearance
    const involvedFiles = this.extractInvolvedFiles(orderedPartSections);

    this.logger.debug(
      `Template map: ${orderedPartSections.length} sections, ${involvedFiles.length} unique files`,
    );

    return {
      partSections: orderedPartSections,
      involvedFiles,
    };
  }

  /**
   * Extract unique file paths from part sections in order of first appearance.
   * This allows parsing each file once instead of parsing each section separately.
   * @param partSections The ordered array of part sections
   * @returns Array of unique file paths
   */
  private extractInvolvedFiles(partSections: TemplatePartSections): string[] {
    const seenFiles = new Set<string>();
    const involvedFiles: string[] = [];

    for (const section of partSections) {
      if (!seenFiles.has(section.fileFullPath)) {
        seenFiles.add(section.fileFullPath);
        involvedFiles.push(section.fileFullPath);
      }
    }

    return involvedFiles;
  }

  /**
   * Recursively processes a template file and its includes to build ordered part sections
   * @param filePath The path to the template file to process
   * @param partType The type of this part (main, textPart, sharedPart)
   * @param partName The name of this part
   * @param templateDir The root template directory
   * @param orderedPartSections Array to accumulate part sections in order
   * @param processedFiles Set to track processed files and prevent circular includes
   */
  private processLiquidFileRecursively(
    filePath: string,
    partType: TemplatePartType,
    partName: string,
    templateDir: string,
    orderedPartSections: TemplatePartSections,
    processedFiles: Set<string>,
  ): void {
    if (processedFiles.has(filePath)) {
      this.logger.warn(`Circular include detected: ${filePath}`);
      return;
    }
    processedFiles.add(filePath);

    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Template file does not exist: ${filePath}`);
      return;
    }

    this.logger.debug(`Processing file: ${filePath}`);

    const fileContent = fs.readFileSync(filePath, "utf-8");
    const totalLines = fileContent.split("\n").length;

    const transitionParser = new IncludeParser();
    const includeTags = transitionParser.findAll(fileContent);

    // Process includes and create part sections in order
    let currentStartLine = 0; // 0-based indexing

    for (const includeTag of includeTags) {
      const includeLineNumber = includeTag.lineNumber; // Already 0-based from TreeSitter

      if (currentStartLine < includeLineNumber) {
        orderedPartSections.push({
          fileFullPath: filePath,
          type: partType,
          name: partName,
          startLine: currentStartLine,
          endLine: includeLineNumber - 1,
        });
      }

      // Recursively process the included file
      const includedFilePath = this.resolveIncludedPartFilePath(
        includeTag,
        templateDir,
      );
      if (includedFilePath) {
        this.processLiquidFileRecursively(
          includedFilePath,
          includeTag.type,
          includeTag.name,
          templateDir,
          orderedPartSections,
          processedFiles,
        );
      }

      // Continue from the line after the include
      currentStartLine = includeLineNumber + 1;
    }

    // Add the remaining part of the file (after last include or whole file if no includes)
    if (currentStartLine < totalLines) {
      orderedPartSections.push({
        fileFullPath: filePath,
        type: partType,
        name: partName,
        startLine: currentStartLine,
        endLine: totalLines - 1, // Last line is totalLines - 1 in 0-based indexing
      });
    }

    // Remove from processed files to allow processing the same file in different contexts
    processedFiles.delete(filePath);
  }

  /**
   * Resolves the file path for an included part based on its type
   * @param includeTag The include tag information from TreeSitter
   * @param templateDir The current template directory
   * @returns The resolved file path or null if file doesn't exist
   */
  private resolveIncludedPartFilePath(
    includeTag: IncludeTagInfo,
    templateDir: string,
  ): string | null {
    let partFilePath: string | null;

    if (includeTag.type === "textPart") {
      // Text parts are resolved from config.json
      partFilePath = ConfigReader.resolveTextPartPath(
        templateDir,
        includeTag.name,
      );
      if (!partFilePath) {
        return null;
      }
    } else if (includeTag.type === "sharedPart") {
      // Shared parts are relative to workspace root in shared_parts/{name}/{name}.liquid structure
      partFilePath = path.join(
        this.workspaceRoot,
        TemplateDirectories.sharedPart,
        includeTag.name,
        `${includeTag.name}.liquid`,
      );

      if (!fs.existsSync(partFilePath)) {
        this.logger.warn(`Part file does not exist: ${partFilePath}`);
        return null;
      }
    } else {
      this.logger.warn(`Unknown include type: ${includeTag.type}`);
      return null;
    }

    this.logger.debug(
      `Resolved part file: ${includeTag.type}/${includeTag.name} -> ${partFilePath}`,
    );
    return partFilePath;
  }
}
