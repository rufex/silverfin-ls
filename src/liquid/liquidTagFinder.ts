import { Logger } from "../logger";
import {
  TreeSitterLiquidProvider,
  SyntaxNode,
} from "./treeSitterLiquidProvider";
import * as fs from "fs";
import { TemplatePartsCollectionManager } from "../templates/templatePartsCollectionManager";
import { TemplatePart } from "../templates/types";

export interface NodeInTemplate {
  node: SyntaxNode;
  templatePart: TemplatePart;
  executionIndex: number; // Position in template execution order
}

interface TemplateMapDetails {
  templateParts: TemplatePart[];
  currentFileIndex: number;
}

export class LiquidTagFinder {
  private logger = new Logger("LiquidTagFinder");
  private parser = new TreeSitterLiquidProvider();

  /**
   * Get and validate template map for the given URI and row.
   * Throws descriptive errors if validation fails.
   */
  private async getValidatedTemplateMap(
    textDocumentUri: string,
    currentRow: number,
    workspaceRoot: string,
  ): Promise<TemplateMapDetails> {
    const templateManager =
      TemplatePartsCollectionManager.getInstance(workspaceRoot);
    const templateDetails = await templateManager.getMapAndIndexFromUri(
      textDocumentUri,
      currentRow,
    );

    if (!templateDetails) {
      throw new Error(
        `No template map found for URI: ${textDocumentUri}. ` +
          "The file may not be part of a recognized template or the template structure could not be determined.",
      );
    }

    const { templateParts, currentFileIndex } = templateDetails;

    if (!templateParts || templateParts.length === 0) {
      throw new Error(
        `Template map is empty for URI: ${textDocumentUri}. ` +
          "Cannot process template without parts.",
      );
    }

    if (currentFileIndex === -1 || currentFileIndex >= templateParts.length) {
      throw new Error(
        `Invalid current file index (${currentFileIndex}) for URI: ${textDocumentUri}. ` +
          `Template has ${templateParts.length} parts.`,
      );
    }

    this.logger.info(
      `Template map loaded: ${templateParts.length} parts, current file at index ${currentFileIndex}`,
    );

    return { templateParts, currentFileIndex };
  }

  /**
   * Safely read file content with error handling.
   */
  private readFileContent(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch (error) {
      this.logger.warn(`Could not read file: ${filePath}, ${error}`);
      return null;
    }
  }

  /**
   * Filter nodes that fall within a template part's line range.
   */
  private filterNodesInRange(
    nodes: SyntaxNode[],
    part: TemplatePart,
  ): SyntaxNode[] {
    return nodes.filter(
      (node) =>
        node.startPosition.row >= part.startLine &&
        node.endPosition.row <= part.endLine,
    );
  }

  public async findAllNodesBeforePosition(
    textDocumentUri: string,
    currentRow: number,
    liquidKey: string,
    liquidTypes: string[],
    workspaceRoot: string,
  ): Promise<NodeInTemplate[] | null> {
    try {
      const { templateParts, currentFileIndex } =
        await this.getValidatedTemplateMap(
          textDocumentUri,
          currentRow,
          workspaceRoot,
        );

      const matchingNodes: NodeInTemplate[] = [];

      for (let i = 0; i <= currentFileIndex; i++) {
        const part = templateParts[i];
        const fileContent = this.readFileContent(part.fileFullPath);
        if (!fileContent) continue;

        const nodes = this.findNodesInText(fileContent, liquidKey, liquidTypes);
        const nodesInRange = this.filterNodesInRange(nodes, part);

        if (i === currentFileIndex) {
          for (const node of nodesInRange) {
            if (node.startPosition.row < currentRow) {
              matchingNodes.push({
                node,
                templatePart: part,
                executionIndex: i,
              });
            }
          }
        } else {
          nodesInRange.forEach((node) =>
            matchingNodes.push({ node, templatePart: part, executionIndex: i }),
          );
        }
      }

      return matchingNodes;
    } catch (error) {
      this.logger.error(`findAllNodesBeforePosition failed: ${error}`);
      return null;
    }
  }

  private findNodesInText(
    text: string,
    liquidKey: string,
    liquidTypes: string[],
  ): SyntaxNode[] {
    const tree = this.parser.parseTree(text);
    if (!tree) {
      return [];
    }

    const keyKey = "key";
    const matchingNodes: SyntaxNode[] = [];

    try {
      for (const liquidType of liquidTypes) {
        // Example query:
        // (translation_statement
        //  key: (string) @key
        //  )
        //  (assignment_statement
        //  variable_name: (string) @key
        //  )
        const queryString = `(${liquidType}
          ${keyKey}: (string) @${keyKey}
        )`;

        const matches = this.parser.queryTree(queryString, tree);

        for (const match of matches) {
          for (const capture of match.captures) {
            if (capture.name === "key") {
              const captureKey = this.extractKey(capture.node);
              if (captureKey && captureKey === liquidKey) {
                let parent = capture.node.parent;
                while (parent && parent.type !== liquidType) {
                  parent = parent.parent;
                }
                if (parent) {
                  matchingNodes.push(parent);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Error querying for types [${liquidTypes.join(", ")}]: ${error}`,
      );
    }

    return matchingNodes;
  }

  private extractKey(stringNode: SyntaxNode): string | null {
    if (stringNode.type !== "string") {
      this.logger.warn(`Expected string node, got ${stringNode.type}`);
      return null;
    }
    const text = stringNode.text.trim();
    if (!text) {
      return null;
    }
    return text.replace(/^['"]|['"]$/g, "");
  }

  public async findAllVariableDefinitionsBeforePosition(
    textDocumentUri: string,
    currentRow: number,
    variableName: string,
    workspaceRoot: string,
  ): Promise<NodeInTemplate[] | null> {
    try {
      const { templateParts, currentFileIndex } =
        await this.getValidatedTemplateMap(
          textDocumentUri,
          currentRow,
          workspaceRoot,
        );

      const matchingNodes: NodeInTemplate[] = [];

      for (let i = 0; i <= currentFileIndex; i++) {
        const part = templateParts[i];
        const fileContent = this.readFileContent(part.fileFullPath);
        if (!fileContent) continue;

        const nodes = this.findVariableDefinitionsInText(
          fileContent,
          variableName,
        );
        const nodesInRange = this.filterNodesInRange(nodes, part);

        if (i === currentFileIndex) {
          const filteredNodes = this.filterDefinitionsForCurrentFile(
            nodesInRange,
            currentRow,
          );
          filteredNodes.forEach((node) =>
            matchingNodes.push({ node, templatePart: part, executionIndex: i }),
          );
        } else {
          nodesInRange.forEach((node) =>
            matchingNodes.push({ node, templatePart: part, executionIndex: i }),
          );
        }
      }

      return matchingNodes;
    } catch (error) {
      this.logger.error(
        `findAllVariableDefinitionsBeforePosition failed: ${error}`,
      );
      return null;
    }
  }

  /**
   * Filter definitions in the current file, handling loop scoping.
   * Loop variables shadow outer variables with the same name.
   */
  private filterDefinitionsForCurrentFile(
    nodes: SyntaxNode[],
    currentRow: number,
  ): SyntaxNode[] {
    const beforeCurrentRow = nodes.filter(
      (node) => node.startPosition.row < currentRow,
    );

    // Check if any loop iterator is in scope
    let loopIteratorInScope: SyntaxNode | null = null;
    for (const node of beforeCurrentRow) {
      if (this.isForLoopIterator(node)) {
        const loopParent = this.findForLoopParent(node);
        if (loopParent && this.isPositionInLoopScope(currentRow, loopParent)) {
          loopIteratorInScope = node;
          break;
        }
      }
    }

    // If a loop iterator is in scope, return only that (it shadows outer variables)
    if (loopIteratorInScope) {
      return [loopIteratorInScope];
    }

    // Filter out loop iterators that are not in scope
    // (they shouldn't be visible outside their loop)
    return beforeCurrentRow.filter((node) => {
      if (this.isForLoopIterator(node)) {
        const loopParent = this.findForLoopParent(node);
        // Only include if the loop is still in scope
        return loopParent && this.isPositionInLoopScope(currentRow, loopParent);
      }
      return true; // Include non-loop definitions
    });
  }

  private findVariableDefinitionsInText(
    text: string,
    variableName: string,
  ): SyntaxNode[] {
    const tree = this.parser.parseTree(text);
    if (!tree) {
      return [];
    }

    const matchingNodes: SyntaxNode[] = [];

    // Define the different statement types and their field names
    const statementConfigs = [
      {
        type: "assignment_statement",
        field: "variable_name",
        supportsDeferred: true,
      },
      { type: "capture_statement", field: "variable", supportsDeferred: true },
      { type: "for_loop_statement", field: "item", supportsDeferred: false },
    ];

    try {
      for (const config of statementConfigs) {
        // Query for identifiers directly in the field
        const identifierQueryString = `(${config.type}
          ${config.field}: (identifier) @var_name
        )`;

        const identifierMatches = this.parser.queryTree(
          identifierQueryString,
          tree,
        );

        let matches = identifierMatches;

        // Only query for deferred variables if this field supports them
        if (config.supportsDeferred) {
          // Query for deferred variables in the field
          // (deferred_variable key: (identifier))
          const deferredQueryString = `(${config.type}
            ${config.field}: (deferred_variable
              key: (identifier) @var_name
            )
          )`;

          const deferredMatches = this.parser.queryTree(
            deferredQueryString,
            tree,
          );

          // Combine both match sets
          matches = [...identifierMatches, ...deferredMatches];
        }

        for (const match of matches) {
          for (const capture of match.captures) {
            if (capture.name === "var_name") {
              const capturedName = capture.node.text;
              if (capturedName === variableName) {
                // Check if this identifier is inside a deferred_variable
                const immediateParent = capture.node.parent;
                const isDeferredVariable =
                  immediateParent &&
                  immediateParent.type === "deferred_variable";

                if (isDeferredVariable) {
                  // For deferred variables, return the deferred_variable node itself
                  // This gives us the position of [var] rather than just var
                  matchingNodes.push(immediateParent);
                } else {
                  // For regular identifiers, find the parent statement
                  let parent = capture.node.parent;
                  while (parent && parent.type !== config.type) {
                    parent = parent.parent;
                  }
                  if (parent) {
                    // Find the statement keyword node (assign, capture, for, etc.)
                    // to get a better position instead of the statement start which may include whitespace
                    let keywordNode: SyntaxNode | null = null;
                    for (let i = 0; i < parent.childCount; i++) {
                      const child = parent.child(i);
                      if (
                        child &&
                        (child.type === "assign" ||
                          child.type === "capture" ||
                          child.type === "for")
                      ) {
                        keywordNode = child;
                        break;
                      }
                    }
                    // Use the keyword node if found, otherwise use the parent
                    matchingNodes.push(keywordNode || parent);
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error querying for variable definitions: ${error}`);
    }

    return matchingNodes;
  }

  /**
   * Checks if a node is a for loop iterator variable definition (the 'item' in 'for item in items')
   */
  private isForLoopIterator(node: SyntaxNode): boolean {
    // Check if node's parent is a for_loop_statement
    // by traversing up the tree
    let current: SyntaxNode | null = node;
    while (current) {
      if (current.type === "for_loop_statement") {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * Finds the for_loop_statement parent node for a given node
   */
  private findForLoopParent(node: SyntaxNode): SyntaxNode | null {
    let current: SyntaxNode | null = node;
    while (current) {
      if (current.type === "for_loop_statement") {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Checks if a position is within the scope of a for loop
   * (between the loop start and endfor)
   */
  private isPositionInLoopScope(
    position: number,
    loopNode: SyntaxNode,
  ): boolean {
    const loopStart = loopNode.startPosition.row;
    const loopEnd = loopNode.endPosition.row;
    return position >= loopStart && position <= loopEnd;
  }

  /**
   * Find all variable references across the entire template.
   * Note: This searches ALL template parts, not just those before the current position,
   * because references can occur anywhere after a variable is defined.
   */
  public async findAllVariableReferencesInScope(
    textDocumentUri: string,
    currentRow: number,
    variableName: string,
    workspaceRoot: string,
  ): Promise<NodeInTemplate[] | null> {
    try {
      const { templateParts, currentFileIndex } =
        await this.getValidatedTemplateMap(
          textDocumentUri,
          currentRow,
          workspaceRoot,
        );

      const currentFilePart = templateParts[currentFileIndex];
      if (!currentFilePart) {
        throw new Error(
          `Current file part is undefined at index ${currentFileIndex}. Template map may be corrupted.`,
        );
      }

      this.logger.info(
        `Searching for references in ${templateParts.length} template parts (current: ${currentFilePart.fileFullPath})`,
      );

      const currentFileContent = this.readFileContent(
        currentFilePart.fileFullPath,
      );
      if (!currentFileContent) {
        return null;
      }

      // Check if we're inside a loop with a loop variable that matches
      const currentLoopContext = this.findLoopContext(
        currentFileContent,
        currentRow,
        variableName,
      );

      // If in a loop scope with this variable, only find references in that loop
      if (currentLoopContext) {
        return this.findLoopScopedReferences(
          currentFileContent,
          currentFilePart,
          currentFileIndex,
          currentLoopContext,
          variableName,
        );
      }

      // Otherwise, find all references across template, excluding shadowed loop variables
      return this.findGlobalScopedReferences(templateParts, variableName);
    } catch (error) {
      this.logger.error(`findAllVariableReferencesInScope failed: ${error}`);
      return null;
    }
  }

  /**
   * Find references within a specific loop scope.
   */
  private findLoopScopedReferences(
    fileContent: string,
    templatePart: TemplatePart,
    executionIndex: number,
    loopNode: SyntaxNode,
    variableName: string,
  ): NodeInTemplate[] {
    const matchingNodes: NodeInTemplate[] = [];
    const loopReferences = this.findVariableReferencesInText(
      fileContent,
      variableName,
    );

    for (const node of loopReferences) {
      if (this.isPositionInLoopScope(node.startPosition.row, loopNode)) {
        matchingNodes.push({ node, templatePart, executionIndex });
      }
    }

    this.logger.debug(
      `Found ${matchingNodes.length} references for loop variable: ${variableName}`,
    );
    return matchingNodes;
  }

  /**
   * Find references in global scope, excluding shadowed loop variables.
   * Searches ALL template parts (not just those before current position).
   */
  private findGlobalScopedReferences(
    templateParts: TemplatePart[],
    variableName: string,
  ): NodeInTemplate[] {
    const matchingNodes: NodeInTemplate[] = [];

    for (let i = 0; i < templateParts.length; i++) {
      const part = templateParts[i];
      const fileContent = this.readFileContent(part.fileFullPath);
      if (!fileContent) continue;

      const nodes = this.findVariableReferencesInText(
        fileContent,
        variableName,
      );
      const nodesInRange = this.filterNodesInRange(nodes, part);

      // Filter out references inside loops that shadow this variable
      for (const node of nodesInRange) {
        const loopContext = this.findLoopContext(
          fileContent,
          node.startPosition.row,
          variableName,
        );

        // Only include if not in a shadowing loop
        if (!loopContext) {
          matchingNodes.push({ node, templatePart: part, executionIndex: i });
        }
      }
    }

    this.logger.debug(
      `Found ${matchingNodes.length} references for variable: ${variableName} across ${templateParts.length} template parts`,
    );
    return matchingNodes;
  }

  /**
   * Find if the current position is inside a for loop that defines a variable with the given name
   */
  private findLoopContext(
    text: string,
    position: number,
    variableName: string,
  ): SyntaxNode | null {
    const tree = this.parser.parseTree(text);
    if (!tree) {
      return null;
    }

    try {
      // Query for for loops
      const queryString = "(for_loop_statement) @loop";
      const matches = this.parser.queryTree(queryString, tree);

      for (const match of matches) {
        for (const capture of match.captures) {
          if (capture.name === "loop") {
            const loopNode = capture.node;

            // Check if position is inside this loop
            if (this.isPositionInLoopScope(position, loopNode)) {
              // Check if this loop defines the variable
              const itemField = loopNode.childForFieldName("item");
              if (itemField && itemField.text === variableName) {
                return loopNode;
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error finding loop context: ${error}`);
    }

    return null;
  }

  private findVariableReferencesInText(
    text: string,
    variableName: string,
  ): SyntaxNode[] {
    const tree = this.parser.parseTree(text);
    if (!tree) {
      return [];
    }

    const matchingNodes: SyntaxNode[] = [];

    try {
      const queryString = "(identifier) @var";
      const matches = this.parser.queryTree(queryString, tree);

      for (const match of matches) {
        for (const capture of match.captures) {
          if (capture.name === "var" && capture.node.text === variableName) {
            if (this.isVariableReference(capture.node)) {
              matchingNodes.push(capture.node);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error querying for variable references: ${error}`);
    }

    return matchingNodes;
  }

  /**
   * Determines if an identifier node is a variable reference (not a definition).
   *
   * Context analysis:
   * - References: {{ var }}, {% assign x = var %}, {% if var %}, etc.
   * - Definitions: {% assign var = ... %}, {% capture var %}, {% for var in ... %}
   *
   * @param identifierNode - The identifier node to check
   * @returns true if the identifier is a variable reference, false if it's a definition or other use
   */
  private isVariableReference(identifierNode: SyntaxNode): boolean {
    if (identifierNode.type !== "identifier") {
      return false;
    }

    const parent = identifierNode.parent;
    if (!parent) {
      return false;
    }

    let fieldName: string | null = null;
    for (let i = 0; i < parent.childCount; i++) {
      if (parent.child(i) === identifierNode) {
        fieldName = parent.fieldNameForChild(i);
        break;
      }
    }

    switch (parent.type) {
      case "program":
      case "block":
        return true;

      case "assignment_statement":
        return fieldName === "value";

      case "capture_statement":
        return false;

      case "for_loop_statement":
        return fieldName === "iterator";

      case "if_statement":
      case "unless_statement":
      case "elsif_clause":
        return fieldName === "condition";

      case "push_statement":
      case "pop_statement":
        return fieldName === "array" || fieldName === "item";

      case "filter":
        return fieldName === "body";

      case "argument_list":
        return true;

      case "predicate":
        return fieldName === "left" || fieldName === "right";

      case "translation_expression":
        return fieldName === "key";

      case "deferred_variable":
        return fieldName === "key";

      default:
        return false;
    }
  }

  public async findAllTranslationReferences(
    textDocumentUri: string,
    currentRow: number,
    translationKey: string,
    workspaceRoot: string,
  ): Promise<NodeInTemplate[] | null> {
    try {
      const { templateParts } = await this.getValidatedTemplateMap(
        textDocumentUri,
        currentRow,
        workspaceRoot,
      );

      const matchingNodes: NodeInTemplate[] = [];
      const searchFor = "translation_expression";

      // Search ALL template parts for translation references
      for (let i = 0; i < templateParts.length; i++) {
        const part = templateParts[i];
        const fileContent = this.readFileContent(part.fileFullPath);
        if (!fileContent) continue;

        const nodes = this.findNodesInText(fileContent, translationKey, [
          searchFor,
        ]);
        const nodesInRange = this.filterNodesInRange(nodes, part);

        nodesInRange.forEach((node) =>
          matchingNodes.push({ node, templatePart: part, executionIndex: i }),
        );
      }

      this.logger.debug(
        `Found ${matchingNodes.length} references for translation key: ${translationKey} across ${templateParts.length} template parts`,
      );
      return matchingNodes;
    } catch (error) {
      this.logger.error(`findAllTranslationReferences failed: ${error}`);
      return null;
    }
  }
}
