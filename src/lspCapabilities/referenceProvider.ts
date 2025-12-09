import { Logger } from "../logger";
import { ReferenceParams, Location } from "vscode-languageserver/node";
import { LiquidTagIdentifier } from "../liquid/liquidTagIdentifier";
import { LiquidTagFinder, NodeInTemplate } from "../liquid/liquidTagFinder";
import { URI } from "vscode-uri";
import * as fs from "fs";
import * as Parser from "tree-sitter";

export class ReferenceProvider {
  private workspaceRoot: string | null;
  private textDocumentUri: ReferenceParams["textDocument"]["uri"];
  private position: ReferenceParams["position"];
  private context: ReferenceParams["context"];
  private logger: Logger;

  constructor(params: ReferenceParams, workspaceRoot: string | null) {
    this.workspaceRoot = workspaceRoot || null;
    this.textDocumentUri = params.textDocument.uri;
    this.position = params.position;
    this.context = params.context;
    this.logger = new Logger("ReferenceProvider");
  }

  public async handleReferenceRequest(): Promise<Location[] | null> {
    const filePath = URI.parse(this.textDocumentUri).fsPath;
    const fileContent = fs.readFileSync(filePath, "utf8");

    if (!fileContent) {
      this.logger.error(`Document not found for URI: ${this.textDocumentUri}`);
      return null;
    }

    const identifier = new LiquidTagIdentifier();

    // Check for translation tag (both expressions and statements/definitions)
    const liquidNode = identifier.identifyNode(
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
    const variableNode = identifier.identifyVariable(
      fileContent,
      this.position.line,
      this.position.character,
    );

    if (variableNode) {
      return this.handleVariableReferences(variableNode);
    }

    // If not a reference, check if it's a definition
    const identifierNode = identifier.getIdentifierAtPosition(
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
    variableNode: Parser.SyntaxNode,
  ): Promise<Location[] | null> {
    const variableName = variableNode.text;
    this.logger.debug(`Looking for variable references: ${variableName}`);

    if (!variableName || !this.workspaceRoot) {
      return null;
    }

    const finder = new LiquidTagFinder();
    const nodes = await finder.findAllVariableReferencesInScope(
      this.textDocumentUri,
      this.position.line,
      variableName,
      this.workspaceRoot,
    );

    if (!nodes || nodes.length === 0) {
      this.logger.debug(`No variable references found for: ${variableName}`);
      return null;
    }

    const locations: Location[] = nodes.map((node) =>
      this.nodeToLocation(node),
    );

    // Always include definitions (LSP standard behavior)
    // includeDeclaration defaults to true per LSP spec
    if (this.context.includeDeclaration !== false) {
      const definitions = await finder.findAllVariableDefinitionsBeforePosition(
        this.textDocumentUri,
        Number.MAX_SAFE_INTEGER,
        variableName,
        this.workspaceRoot,
      );

      if (definitions && definitions.length > 0) {
        this.addUniqueLocations(
          locations,
          definitions.map((node) => this.nodeToLocation(node)),
        );
      }
    }

    // Sort locations by file and line number for consistent ordering
    const sortedLocations = this.sortLocationsByTemplateOrder(locations);

    this.logger.debug(
      `Found ${sortedLocations.length} references for variable: ${variableName}`,
    );
    return sortedLocations;
  }

  private async handleTranslationReferences(
    liquidNode: Parser.SyntaxNode,
  ): Promise<Location[] | null> {
    const identifier = new LiquidTagIdentifier();
    const nodeKey = identifier.identifyNodeKey(liquidNode);

    if (!nodeKey || !this.workspaceRoot) {
      return null;
    }

    const finder = new LiquidTagFinder();
    const nodes = await finder.findAllTranslationReferences(
      this.textDocumentUri,
      this.position.line,
      nodeKey,
      this.workspaceRoot,
    );

    if (!nodes || nodes.length === 0) {
      this.logger.debug(`No translation references found for key: ${nodeKey}`);
      return null;
    }

    const locations: Location[] = nodes.map((node) =>
      this.nodeToLocation(node),
    );

    // Always include definitions (LSP standard behavior)
    // includeDeclaration defaults to true per LSP spec
    if (this.context.includeDeclaration !== false) {
      const definitions = await finder.findAllNodesBeforePosition(
        this.textDocumentUri,
        Number.MAX_SAFE_INTEGER,
        nodeKey,
        ["translation_statement"],
        this.workspaceRoot,
      );

      if (definitions && definitions.length > 0) {
        this.addUniqueLocations(
          locations,
          definitions.map((node) => this.nodeToLocation(node)),
        );
      }
    }

    // Sort locations by file and line number for consistent ordering
    const sortedLocations = this.sortLocationsByTemplateOrder(locations);

    this.logger.debug(
      `Found ${sortedLocations.length} references for translation tag`,
    );
    return sortedLocations;
  }

  /**
   * Convert a NodeInTemplate to a Location object.
   */
  private nodeToLocation(nodeInTemplate: NodeInTemplate): Location {
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
    };
  }

  /**
   * Add locations from newLocations to locations array, avoiding duplicates.
   */
  private addUniqueLocations(
    locations: Location[],
    newLocations: Location[],
  ): void {
    for (const newLoc of newLocations) {
      if (!this.isDuplicateLocation(locations, newLoc)) {
        locations.push(newLoc);
      }
    }
  }

  /**
   * Check if a location already exists in the locations array.
   */
  private isDuplicateLocation(
    locations: Location[],
    newLoc: Location,
  ): boolean {
    return locations.some(
      (loc) =>
        loc.uri === newLoc.uri &&
        loc.range.start.line === newLoc.range.start.line &&
        loc.range.start.character === newLoc.range.start.character,
    );
  }

  /**
   * Sort locations by URI (file) and then by line number within each file.
   * This orders results by template execution order.
   */
  private sortLocationsByTemplateOrder(locations: Location[]): Location[] {
    return locations.sort((a, b) => {
      // First sort by URI (file path)
      if (a.uri !== b.uri) {
        return a.uri.localeCompare(b.uri);
      }
      // Then by line number within the same file
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }
      // Finally by character position
      return a.range.start.character - b.range.start.character;
    });
  }
}
