import * as fs from "fs";
import * as path from "path";
import { Logger } from "../logger";
import { TextPartsConfig, TemplateConfig } from "./types";

/**
 * Utility class for reading and parsing template config.json files
 */
export class ConfigReader {
  private static logger = new Logger("ConfigReader");

  /**
   * Resolves a text part name to its full file path based on the template's config.json
   * @param templateDir Absolute path to template directory
   * @param partName Name of the text part (e.g., "part_1")
   * @returns Absolute path to the text part file, or null if not found
   */
  static resolveTextPartPath(
    templateDir: string,
    partName: string,
  ): string | null {
    const textPartsConfig = this.getTextPartsConfig(templateDir);

    if (!textPartsConfig) {
      this.logger.warn(
        `Cannot resolve text part "${partName}": no text_parts in config at ${templateDir}/config.json`,
      );
      return null;
    }

    const relativePath = textPartsConfig[partName];

    if (!relativePath) {
      this.logger.warn(
        `Text part "${partName}" not found in config.json: ${templateDir}/config.json`,
      );
      return null;
    }

    // Resolve the part absolute path
    const absolutePath = path.resolve(templateDir, relativePath);

    // Ensure resolved path is within template directory
    const normalizedTemplateDir = path.resolve(templateDir);
    if (
      !absolutePath.startsWith(normalizedTemplateDir + path.sep) &&
      absolutePath !== normalizedTemplateDir
    ) {
      this.logger.error(
        `Text part path "${relativePath}" resolves outside template directory: ${absolutePath}`,
      );
      return null;
    }

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      this.logger.error(
        `Text part file does not exist: ${absolutePath} (defined in ${templateDir}/config.json as "${relativePath}")`,
      );
      return null;
    }

    this.logger.debug(`Resolved text part "${partName}" to: ${absolutePath}`);
    return absolutePath;
  }

  /**
   * Gets text_parts mapping from config.json of a template directory
   * @param templateDir Absolute path to template directory
   * @returns Text parts mapping or null if not found
   */
  static getTextPartsConfig(templateDir: string): TextPartsConfig | null {
    const config = this.readConfig(templateDir);

    if (!config) {
      return null;
    }

    if (!config.text_parts) {
      this.logger.debug(
        `No text_parts field in config.json: ${templateDir}/config.json`,
      );
      return null;
    }

    return config.text_parts;
  }

  /**
   * Reads and parses config.json from a template directory
   * @param templateDir Absolute path to template directory
   * @returns Parsed config or null if not found/invalid
   */
  private static readConfig(templateDir: string): TemplateConfig | null {
    const configPath = path.join(templateDir, "config.json");

    if (!fs.existsSync(configPath)) {
      this.logger.debug(`Config file not found: ${configPath}`);
      return null;
    }

    try {
      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent) as TemplateConfig;
      this.logger.debug(`Successfully read config: ${configPath}`);
      return config;
    } catch (error) {
      this.logger.error(
        `Failed to parse config.json at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
