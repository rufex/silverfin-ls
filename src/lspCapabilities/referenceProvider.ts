import { Logger } from "../logger";
import { ReferenceParams, Location } from "vscode-languageserver/node";
import { LiquidTagIdentifier } from "../liquid/liquidTagIdentifier";
import { LiquidTagFinder, NodeInTemplate } from "../liquid/liquidTagFinder";
import { URI } from "vscode-uri";
import * as fs from "fs";
import { SyntaxNode } from "../liquid/treeSitterLiquidProvider";

// Constants
const ALL_LINES = Number.MAX_SAFE_INTEGER; // Search entire file without line limit

// Extended Location with execution order information
interface LocationWithOrder extends Location {
  executionIndex: number;
}

export class ReferenceProvider {
  private workspaceRoot: string | null;
  private textDocumentUri: ReferenceParams["textDocument"]["uri"];
  private position: ReferenceParams["position"];
  private context: ReferenceParams["context"];
  private logger: Logger;
  private identifier: LiquidTagIdentifier;
  private finder: LiquidTagFinder;

  constructor(params: ReferenceParams, workspaceRoot: string | null) {
    this.workspaceRoot = workspaceRoot || null;
    this.textDocumentUri = params.textDocument.uri;
    this.position = params.position;
    this.context = params.context;
    this.logger = new Logger("ReferenceProvider");
    this.identifier = new LiquidTagIdentifier();
    this.finder = new LiquidTagFinder();
  }

  public async handleReferenceRequest(): Promise<Location[] | null> {
    const filePath = URI.parse(this.textDocumentUri).fsPath;
    const fileContent = fs.readFileSync(filePath, "utf8");

    if (!fileContent) {
      this.logger.error(`Document not found for URI: ${this.textDocumentUri}`);
      return null;
    }

    // Check for translation tag (both expressions and statements/definitions)
    const liquidNode = this.identifier.identifyNode(
      fileContent,
      this.position.line,
      this.position.character,
    );

    if (
      liquidNode?.type === "translation_expression" ||
      liquidNode?.type === "translation_statement"
    ) {
      return this.handleTranslationReferences(liquidNode);
    }

    // Check for variable (reference or definition)
    const variableNode = this.identifier.identifyVariable(
      fileContent,
      this.position.line,
      this.position.character,
    );

    if (variableNode) {
      return this.handleVariableReferences(variableNode);
    }

    // If not a reference, check if it's a definition
    const identifierNode = this.identifier.getIdentifierAtPosition(
      fileContent,
      this.position.line,
      this.position.character,
    );

    if (identifierNode) {
      this.logger.debug(
        `Found identifier but not a reference, checking if it's a definition: ${identifierNode.text}`,
      );
      return this.handleVariableReferences(identifierNode);
    }

    this.logger.debug(
      `No reference handler for node type: ${liquidNode?.type || "unknown"}`,
    );
    return null;
  }

  private async handleVariableReferences(
    variableNode: SyntaxNode,
  ): Promise<Location[] | null> {
    const variableName = variableNode.text;
    this.logger.debug(`Looking for variable references: ${variableName}`);

    if (!variableName || !this.workspaceRoot) {
      return null;
    }

    const nodes = await this.finder.findAllVariableReferencesInScope(
      this.textDocumentUri,
      this.position.line,
      variableName,
      this.workspaceRoot,
    );

    if (!nodes || nodes.length === 0) {
      this.logger.debug(`No variable references found for: ${variableName}`);
      return null;
    }

    const locations: LocationWithOrder[] = nodes.map((node) =>
      this.nodeToLocationWithOrder(node),
    );

    // Always include definitions (LSP standard behavior)
    // includeDeclaration defaults to true per LSP spec
    if (this.context.includeDeclaration !== false) {
      const definitions = await this.finder.findAllVariableDefinitionsBeforePosition(
        this.textDocumentUri,
        ALL_LINES, // Search entire file for definitions
        variableName,
        this.workspaceRoot,
      );

      if (definitions && definitions.length > 0) {
        this.addUniqueLocations(
          locations,
          definitions.map((node) => this.nodeToLocationWithOrder(node)),
        );
      }
    }

    // Sort locations by template execution order
    const sortedLocations = this.sortLocationsByTemplateOrder(locations);

    this.logger.debug(
      `Found ${sortedLocations.length} references for variable: ${variableName}`,
    );
    return sortedLocations;
  }

  private async handleTranslationReferences(
    liquidNode: SyntaxNode,
  ): Promise<Location[] | null> {
    const nodeKey = this.identifier.identifyNodeKey(liquidNode);

    if (!nodeKey || !this.workspaceRoot) {
      return null;
    }

    const nodes = await this.finder.findAllTranslationReferences(
      this.textDocumentUri,
      this.position.line,
      nodeKey,
      this.workspaceRoot,
    );

    if (!nodes || nodes.length === 0) {
      this.logger.debug(`No translation references found for key: ${nodeKey}`);
      return null;
    }

    const locations: LocationWithOrder[] = nodes.map((node) =>
      this.nodeToLocationWithOrder(node),
    );

    // Always include definitions (LSP standard behavior)
    // includeDeclaration defaults to true per LSP spec
    if (this.context.includeDeclaration !== false) {
      const definitions = await this.finder.findAllNodesBeforePosition(
        this.textDocumentUri,
        ALL_LINES, // Search entire file for definitions
        nodeKey,
        ["translation_statement"],
        this.workspaceRoot,
      );

      if (definitions && definitions.length > 0) {
        this.addUniqueLocations(
          locations,
          definitions.map((node) => this.nodeToLocationWithOrder(node)),
        );
      }
    }

    // Sort locations by template execution order
    const sortedLocations = this.sortLocationsByTemplateOrder(locations);

    this.logger.debug(
      `Found ${sortedLocations.length} references for translation tag`,
    );
    return sortedLocations;
  }

  /**
   * Convert a NodeInTemplate to a Location object with execution order.
   */
  private nodeToLocationWithOrder(
    nodeInTemplate: NodeInTemplate,
  ): LocationWithOrder {
    return {
      uri: URI.file(nodeInTemplate.templatePart.fileFullPath).toString(),
      range: {
        start: {
          line: nodeInTemplate.node.startPosition.row,
          character: nodeInTemplate.node.startPosition.column,
        },
        end: {
          line: nodeInTemplate.node.endPosition.row,
          character: nodeInTemplate.node.endPosition.column,
        },
      },
      executionIndex: nodeInTemplate.executionIndex,
    };
  }

  /**
   * Add locations from newLocations to locations array, avoiding duplicates.
   * Uses Set for O(1) lookup instead of O(n) for better performance.
   */
  private addUniqueLocations(
    locations: LocationWithOrder[],
    newLocations: LocationWithOrder[],
  ): void {
    const existing = new Set(
      locations.map(
        (loc) =>
          `${loc.uri}:${loc.range.start.line}:${loc.range.start.character}`,
      ),
    );

    for (const newLoc of newLocations) {
      const key = `${newLoc.uri}:${newLoc.range.start.line}:${newLoc.range.start.character}`;
      if (!existing.has(key)) {
        locations.push(newLoc);
        existing.add(key);
      }
    }
  }

  /**
   * Sort locations by template execution order.
   * Uses the executionIndex from NodeInTemplate to maintain proper order.
   */
  private sortLocationsByTemplateOrder(
    locations: LocationWithOrder[],
  ): Location[] {
    return locations.sort((a, b) => {
      // First sort by execution index (template part order)
      if (a.executionIndex !== b.executionIndex) {
        return a.executionIndex - b.executionIndex;
      }

      // Within the same part, sort by line number
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }

      // Finally by character position
      return a.range.start.character - b.range.start.character;
    });
  }
}
