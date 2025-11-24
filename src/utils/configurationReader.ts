import * as fs from "fs";
import * as path from "path";
import { Logger } from "../logger";
import { MainTemplateTypes } from "../templates/types";

export interface LiquidLSConfiguration {
  currentTemplate?: {
    type: MainTemplateTypes;
    handle: string;
  };
}

export class ConfigurationReader {
  private logger: Logger = new Logger("ConfigurationReader");
  private configFilePath: string;

  constructor(workspaceRoot: string) {
    this.configFilePath = path.join(workspaceRoot, "liquid-ls.json");
  }

  /**
   * Gets the current template configuration (always reads fresh from file)
   */
  public getCurrentTemplate(): {
    type: MainTemplateTypes;
    handle: string;
  } | null {
    const config = this.readConfiguration();

    if (config?.currentTemplate) {
      return config.currentTemplate;
    }

    return null;
  }

  /**
   * Reads and parses the liquid-ls.json configuration file
   */
  private readConfiguration(): LiquidLSConfiguration | null {
    try {
      if (!this.hasConfigurationFile()) {
        this.logger.debug("No liquid-ls.json file found in workspace root");
        return null;
      }

      const configContent = fs.readFileSync(this.configFilePath, "utf8");
      const config = JSON.parse(configContent) as LiquidLSConfiguration;

      this.logger.debug(`Configuration loaded: ${JSON.stringify(config)}`);
      return config;
    } catch (error) {
      this.logger.error(`Error reading liquid-ls.json: ${error}`);
      return null;
    }
  }

  /**
   * Checks if a configuration file exists
   */
  private hasConfigurationFile(): boolean {
    return fs.existsSync(this.configFilePath);
  }
}
