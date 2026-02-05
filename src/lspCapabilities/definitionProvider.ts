import { Logger } from "../logger";
import { DefinitionParams, Location } from "vscode-languageserver/node";
import { LiquidTagIdentifier } from "../liquid/liquidTagIdentifier";
import { LiquidTagFinder } from "../liquid/liquidTagFinder";
import { URI } from "vscode-uri";
import * as fs from "fs";
import * as path from "path";
import { IncludeParser } from "../liquid/includeParser";
import { parseTemplateUri } from "../utils/templateUriParser";
import { TemplateDirectories } from "../templates/types";
import { ConfigReader } from "../templates/configReader";
import { SyntaxNode } from "../liquid/treeSitterLiquidProvider";

export class DefinitionProvider {
  private workspaceRoot: string | null;
  private textDocumentUri: DefinitionParams["textDocument"]["uri"];
  private position: DefinitionParams["position"];
  private logger: Logger;
  private identifier: LiquidTagIdentifier;
  private finder: LiquidTagFinder;

  constructor(params: DefinitionParams, workspaceRoot: string | null) {
    this.workspaceRoot = workspaceRoot || null;
    this.textDocumentUri = params.textDocument.uri;
    this.position = params.position;
    this.logger = new Logger("DefinitionProvider");
    this.identifier = new LiquidTagIdentifier();
    this.finder = new LiquidTagFinder();
  }

  public async handleDefinitionRequest(): Promise<Location[] | null> {
    const filePath = URI.parse(this.textDocumentUri).fsPath;
    const fileContent = fs.readFileSync(filePath, "utf8");

    if (!fileContent) {
      this.logger.error(`Document not found for URI: ${this.textDocumentUri}`);
      return null;
    }

    // Identify liquid tag under cursor. Using LiquidTagIdentifier
    // Identify what we need to look for
    // Search for all definitions in the template files. Using LiquidTagFinder
    // Examples in fixtures/liquid_tag_reference.liquid

    const liquidNode = this.identifier.identifyNode(
      fileContent,
      this.position.line,
      this.position.character,
    );

    if (liquidNode) {
      // INCLUDE TAG
      if (liquidNode.type === "include_statement") {
        return this.handleIncludeTag(liquidNode);
      }

      // TRANSLATION TAG with string literal key
      if (liquidNode.type === "translation_expression") {
        const result = await this.handleTranslationTag(liquidNode);
        if (result) {
          return result;
        }
        // If no translation found, fall through to check for variable
      }
    }

    // VARIABLE
    const variableNode = this.identifier.identifyVariable(
      fileContent,
      this.position.line,
      this.position.character,
    );

    if (variableNode) {
      return this.handleVariable(variableNode);
    }

    this.logger.debug(
      `No definition handler for node type: ${liquidNode?.type || "unknown"}`,
    );
    return null;
  }

  /**
   * Handles the definition lookup for include tags.
   * Either shared parts or text parts.
   * @param liquidNode The syntax node representing the include tag.
   * @returns An array of Locations pointing to the definition, or null if not found.
   */
  private handleIncludeTag(liquidNode: SyntaxNode): Location[] | null {
    const includeParser = new IncludeParser();
    const includeTag = includeParser.identifyIncludeTag(liquidNode);
    const templateInfo = parseTemplateUri(this.textDocumentUri);
    if (includeTag && this.workspaceRoot && templateInfo) {
      let partPath: string | null = null;

      if (includeTag.type === "sharedPart") {
        partPath = `${this.workspaceRoot}/shared_parts/${includeTag.name}/${includeTag.name}.liquid`;

        if (!fs.existsSync(partPath)) {
          this.logger.debug(`File not found for include tag: ${partPath}`);
          partPath = null;
        }
      } else if (includeTag.type === "textPart") {
        const templateDir = TemplateDirectories[templateInfo.templateType];
        const templateDirPath = path.join(
          this.workspaceRoot,
          templateDir,
          templateInfo.templateName,
        );
        partPath = ConfigReader.resolveTextPartPath(
          templateDirPath,
          includeTag.name,
        );
        if (!partPath) {
          return null;
        }
      }

      if (partPath) {
        this.logger.debug(`Found file for include tag: ${partPath}`);
        return [
          {
            uri: URI.file(partPath).toString(),
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
          },
        ];
      }
    }

    this.logger.warn("No definition found for include tag");
    return null;
  }

  private async handleTranslationTag(
    liquidNode: SyntaxNode,
  ): Promise<Location[] | null> {
    const searchFor = "translation_statement";
    const nodeKey = this.identifier.identifyNodeKey(liquidNode);
    if (nodeKey && this.workspaceRoot) {
      const nodes = await this.finder.findAllNodesBeforePosition(
        this.textDocumentUri,
        this.position.line,
        nodeKey,
        [searchFor],
        this.workspaceRoot,
      );
      if (!nodes) {
        this.logger.debug(`No translation nodes found for key: ${nodeKey}`);
        return null;
      }

      // return all nodes
      const locations: Location[] = nodes.map((node) => {
        return {
          uri: URI.file(node.partSection.fileFullPath).toString(),
          range: {
            start: {
              line: node.node.startPosition.row,
              character: node.node.startPosition.column,
            },
            end: {
              line: node.node.endPosition.row,
              character: node.node.endPosition.column,
            },
          },
        };
      });
      this.logger.debug(
        `Found ${locations.length} definitions for translation tag`,
      );
      return locations;
    }

    this.logger.warn("No definition found for translation tag");
    return null;
  }

  private async handleVariable(
    liquidNode: SyntaxNode,
  ): Promise<Location[] | null> {
    const variableName = liquidNode.text;
    this.logger.debug(`Looking for variable definitions: ${variableName}`);

    if (!variableName || !this.workspaceRoot) {
      return null;
    }

    const nodes = await this.finder.findAllVariableDefinitionsBeforePosition(
      this.textDocumentUri,
      this.position.line,
      variableName,
      this.workspaceRoot,
    );

    if (!nodes || nodes.length === 0) {
      this.logger.debug(`No variable definitions found for: ${variableName}`);
      return null;
    }

    // Return all nodes
    const locations: Location[] = nodes.map((node) => {
      return {
        uri: URI.file(node.partSection.fileFullPath).toString(),
        range: {
          start: {
            line: node.node.startPosition.row,
            character: node.node.startPosition.column,
          },
          end: {
            line: node.node.endPosition.row,
            character: node.node.endPosition.column,
          },
        },
      };
    });

    this.logger.debug(
      `Found ${locations.length} definitions for variable: ${variableName}`,
    );
    return locations;
  }
}
