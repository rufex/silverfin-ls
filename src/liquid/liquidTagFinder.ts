import { Logger } from "../logger";
import * as Parser from "tree-sitter";
import { TreeSitterLiquidProvider } from "./treeSitterLiquidProvider";
import * as fs from "fs";
import { TemplatePartsCollectionManager } from "../templates/templatePartsCollectionManager";
import { TemplatePart } from "../templates/types";

export interface NodeInTemplate {
  node: Parser.SyntaxNode;
  templatePart: { fileFullPath: string };
}

export class LiquidTagFinder {
  private logger = new Logger("LiquidTagFinder");
  private parser = new TreeSitterLiquidProvider();

  constructor() {}

  public async findAllNodesBeforePosition(
    textDocumentUri: string,
    currentRow: number,
    liquidKey: string,
    liquidTypes: string[],
    workspaceRoot: string,
  ): Promise<NodeInTemplate[] | null> {
    const templateManager =
      TemplatePartsCollectionManager.getInstance(workspaceRoot);
    const templateDetails = await templateManager.getMapAndIndexFromUri(
      textDocumentUri,
      currentRow,
    );

    if (!templateDetails) {
      this.logger.error(
        `No template map found for URI: ${textDocumentUri}. ` +
          "Cannot find nodes without a valid template map.",
      );
      return null;
    }
    const { templateParts, currentFileIndex } = templateDetails;

    if (!templateParts || templateParts.length === 0) {
      this.logger.error(`Template map is empty for URI: ${textDocumentUri}.`);
      return null;
    }

    if (currentFileIndex === -1 || currentFileIndex >= templateParts.length) {
      this.logger.error(
        `Invalid current file index (${currentFileIndex}) for URI: ${textDocumentUri}. ` +
          `Template has ${templateParts.length} parts.`,
      );
      return null;
    }

    this.logger.info(
      `Template map loaded: ${templateParts.length} parts, current file at index ${currentFileIndex}`,
    );

    const matchingNodes: NodeInTemplate[] = [];

    for (let i = 0; i <= currentFileIndex; i++) {
      const part = templateParts[i];

      try {
        const fileContent = fs.readFileSync(part.fileFullPath, "utf8");
        const nodes = this.findNodesInText(fileContent, liquidKey, liquidTypes);

        // Filter nodes that are within this part's line range
        const nodesInRange = nodes.filter(
          (node) =>
            node.startPosition.row >= part.startLine &&
            node.endPosition.row <= part.endLine,
        );

        if (i === currentFileIndex) {
          for (const node of nodesInRange) {
            if (node.startPosition.row < currentRow) {
              matchingNodes.push({ node, templatePart: part });
            }
          }
        } else {
          nodesInRange.forEach((node) =>
            matchingNodes.push({ node, templatePart: part }),
          );
        }
      } catch (error) {
        this.logger.warn(`Could not read file: ${part.fileFullPath}, ${error}`);
      }
    }

    return matchingNodes;
  }

  private findNodesInText(
    text: string,
    liquidKey: string,
    liquidTypes: string[],
  ): Parser.SyntaxNode[] {
    const tree = this.parser.parseTree(text);
    if (!tree) {
      return [];
    }

    const keyKey = "key";
    const matchingNodes: Parser.SyntaxNode[] = [];

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
              if (captureKey === liquidKey) {
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
        `Error querying for ${liquidTypes.concat(", ")}: ${error}`,
      );
    }

    return matchingNodes;
  }

  private extractKey(stringNode: Parser.SyntaxNode): string {
    const text = stringNode.text;
    return text.replace(/^['"]|['"]$/g, "");
  }

  public async findAllVariableDefinitionsBeforePosition(
    textDocumentUri: string,
    currentRow: number,
    variableName: string,
    workspaceRoot: string,
  ): Promise<NodeInTemplate[] | null> {
    const templateManager =
      TemplatePartsCollectionManager.getInstance(workspaceRoot);
    const templateDetails = await templateManager.getMapAndIndexFromUri(
      textDocumentUri,
      currentRow,
    );

    if (!templateDetails) {
      this.logger.error(
        `No template map found for URI: ${textDocumentUri}. ` +
          "Cannot find variable definitions without a valid template map.",
      );
      return null;
    }
    const { templateParts, currentFileIndex } = templateDetails;

    if (!templateParts || templateParts.length === 0) {
      this.logger.error(`Template map is empty for URI: ${textDocumentUri}.`);
      return null;
    }

    if (currentFileIndex === -1 || currentFileIndex >= templateParts.length) {
      this.logger.error(
        `Invalid current file index (${currentFileIndex}) for URI: ${textDocumentUri}. ` +
          `Template has ${templateParts.length} parts.`,
      );
      return null;
    }

    this.logger.info(
      `Template map loaded: ${templateParts.length} parts, current file at index ${currentFileIndex}`,
    );

    const matchingNodes: NodeInTemplate[] = [];

    for (let i = 0; i <= currentFileIndex; i++) {
      const part = templateParts[i];

      try {
        const fileContent = fs.readFileSync(part.fileFullPath, "utf8");
        const nodes = this.findVariableDefinitionsInText(
          fileContent,
          variableName,
        );

        // Filter nodes that are within this part's line range
        const nodesInRange = nodes.filter(
          (node) =>
            node.startPosition.row >= part.startLine &&
            node.endPosition.row <= part.endLine,
        );

        if (i === currentFileIndex) {
          let hasLoopIteratorInScope = false;

          for (const node of nodesInRange) {
            if (node.startPosition.row < currentRow) {
              // Check if this is a for loop iterator variable
              if (this.isForLoopIterator(node)) {
                const loopParent = this.findForLoopParent(node);
                if (
                  loopParent &&
                  this.isPositionInLoopScope(currentRow, loopParent)
                ) {
                  matchingNodes.push({ node, templatePart: part });
                  hasLoopIteratorInScope = true;
                }
              } else {
                matchingNodes.push({ node, templatePart: part });
              }
            }
          }

          // If we found a loop iterator in scope, remove non-loop definitions
          // (loop variables shadow outer variables with the same name)
          if (hasLoopIteratorInScope && matchingNodes.length > 1) {
            // Keep only loop iterators that are in scope
            const filteredNodes = matchingNodes.filter((nodeInTemplate) =>
              this.isForLoopIterator(nodeInTemplate.node),
            );
            matchingNodes.length = 0;
            matchingNodes.push(...filteredNodes);
          }
        } else {
          nodesInRange.forEach((node) =>
            matchingNodes.push({ node, templatePart: part }),
          );
        }
      } catch (error) {
        this.logger.warn(`Could not read file: ${part.fileFullPath}, ${error}`);
      }
    }

    return matchingNodes;
  }

  private findVariableDefinitionsInText(
    text: string,
    variableName: string,
  ): Parser.SyntaxNode[] {
    const tree = this.parser.parseTree(text);
    if (!tree) {
      return [];
    }

    const matchingNodes: Parser.SyntaxNode[] = [];

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
                    let keywordNode: Parser.SyntaxNode | null = null;
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
  private isForLoopIterator(node: Parser.SyntaxNode): boolean {
    // Check if node's parent is a for_loop_statement
    // by traversing up the tree
    let current: Parser.SyntaxNode | null = node;
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
  private findForLoopParent(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    let current: Parser.SyntaxNode | null = node;
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
    loopNode: Parser.SyntaxNode,
  ): boolean {
    const loopStart = loopNode.startPosition.row;
    const loopEnd = loopNode.endPosition.row;
    return position >= loopStart && position <= loopEnd;
  }

  public async findAllVariableReferencesInScope(
    textDocumentUri: string,
    currentRow: number,
    variableName: string,
    workspaceRoot: string,
  ): Promise<NodeInTemplate[] | null> {
    const templateManager =
      TemplatePartsCollectionManager.getInstance(workspaceRoot);
    const templateDetails = await templateManager.getMapAndIndexFromUri(
      textDocumentUri,
      currentRow,
    );

    if (!templateDetails) {
      this.logger.error(
        `No template map found for URI: ${textDocumentUri}. ` +
          "Cannot provide references without a valid template map. " +
          "This indicates the file is not part of a recognized template or the template structure could not be determined.",
      );
      return null;
    }
    const { templateParts, currentFileIndex } = templateDetails;

    if (!templateParts || templateParts.length === 0) {
      this.logger.error(
        `Template map is empty for URI: ${textDocumentUri}. ` +
          "Cannot provide references without template parts.",
      );
      return null;
    }

    if (currentFileIndex === -1 || currentFileIndex >= templateParts.length) {
      this.logger.error(
        `Invalid current file index (${currentFileIndex}) for URI: ${textDocumentUri}. ` +
          `Template has ${templateParts.length} parts. Cannot identify current file position in template map.`,
      );
      return null;
    }

    const currentFilePart = templateParts[currentFileIndex];
    if (!currentFilePart) {
      this.logger.error(
        `Current file part is undefined at index ${currentFileIndex} for URI: ${textDocumentUri}. ` +
          "This should never happen if currentFileIndex is valid. Template map may be corrupted.",
      );
      return null;
    }

    this.logger.info(
      `Template map loaded: ${templateParts.length} parts, current file at index ${currentFileIndex} (${currentFilePart.fileFullPath})`,
    );

    // First, check if we're inside a loop with a loop variable that matches
    const currentFileContent = fs.readFileSync(
      currentFilePart.fileFullPath,
      "utf8",
    );
    const currentLoopContext = this.findLoopContext(
      currentFileContent,
      currentRow,
      variableName,
    );

    // If we're in a loop scope with this variable name, only find references in that loop
    if (currentLoopContext) {
      return this.findLoopScopedReferences(
        currentFileContent,
        currentFilePart,
        currentLoopContext,
        variableName,
      );
    }

    // Otherwise, find all references in scope but exclude those inside loops that shadow the variable
    return this.findGlobalScopedReferences(templateParts, variableName);
  }

  /**
   * Find references within a specific loop scope.
   */
  private findLoopScopedReferences(
    fileContent: string,
    templatePart: TemplatePart,
    loopNode: Parser.SyntaxNode,
    variableName: string,
  ): NodeInTemplate[] {
    const matchingNodes: NodeInTemplate[] = [];
    const loopReferences = this.findVariableReferencesInText(
      fileContent,
      variableName,
    );

    for (const node of loopReferences) {
      if (this.isPositionInLoopScope(node.startPosition.row, loopNode)) {
        matchingNodes.push({ node, templatePart });
      }
    }

    this.logger.debug(
      `Found ${matchingNodes.length} references for loop variable: ${variableName}`,
    );
    return matchingNodes;
  }

  /**
   * Find references in global scope, excluding shadowed loop variables.
   * NOTE: Unlike definitions, references should be found in ALL template parts,
   * not just those before the current position.
   */
  private findGlobalScopedReferences(
    templateParts: TemplatePart[],
    variableName: string,
  ): NodeInTemplate[] {
    const matchingNodes: NodeInTemplate[] = [];

    // Search ALL template parts for references (not just up to currentFileIndex)
    for (let i = 0; i < templateParts.length; i++) {
      const part = templateParts[i];

      try {
        const fileContent = fs.readFileSync(part.fileFullPath, "utf8");
        const nodes = this.findVariableReferencesInText(
          fileContent,
          variableName,
        );

        const nodesInRange = nodes.filter(
          (node) =>
            node.startPosition.row >= part.startLine &&
            node.endPosition.row <= part.endLine,
        );

        // Filter out references inside loops that shadow this variable
        for (const node of nodesInRange) {
          const loopContext = this.findLoopContext(
            fileContent,
            node.startPosition.row,
            variableName,
          );

          // Only include if not in a shadowing loop
          if (!loopContext) {
            matchingNodes.push({ node, templatePart: part });
          }
        }
      } catch (error) {
        this.logger.warn(`Could not read file: ${part.fileFullPath}, ${error}`);
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
  ): Parser.SyntaxNode | null {
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
  ): Parser.SyntaxNode[] {
    const tree = this.parser.parseTree(text);
    if (!tree) {
      return [];
    }

    const matchingNodes: Parser.SyntaxNode[] = [];

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
  private isVariableReference(identifierNode: Parser.SyntaxNode): boolean {
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
    const templateManager =
      TemplatePartsCollectionManager.getInstance(workspaceRoot);
    const templateDetails = await templateManager.getMapAndIndexFromUri(
      textDocumentUri,
      currentRow,
    );

    if (!templateDetails) {
      this.logger.error(
        `No template map found for URI: ${textDocumentUri}. ` +
          "Cannot find translation references without a valid template map.",
      );
      return null;
    }
    const { templateParts, currentFileIndex } = templateDetails;

    if (!templateParts || templateParts.length === 0) {
      this.logger.error(`Template map is empty for URI: ${textDocumentUri}.`);
      return null;
    }

    if (currentFileIndex === -1 || currentFileIndex >= templateParts.length) {
      this.logger.error(
        `Invalid current file index (${currentFileIndex}) for URI: ${textDocumentUri}. ` +
          `Template has ${templateParts.length} parts.`,
      );
      return null;
    }

    this.logger.info(
      `Template map loaded: ${templateParts.length} parts, current file at index ${currentFileIndex}`,
    );

    const matchingNodes: NodeInTemplate[] = [];
    const searchFor = "translation_expression";

    // Search ALL template parts for translation references (not just up to currentFileIndex)
    for (let i = 0; i < templateParts.length; i++) {
      const part = templateParts[i];

      try {
        const fileContent = fs.readFileSync(part.fileFullPath, "utf8");
        const nodes = this.findNodesInText(fileContent, translationKey, [
          searchFor,
        ]);

        const nodesInRange = nodes.filter(
          (node) =>
            node.startPosition.row >= part.startLine &&
            node.endPosition.row <= part.endLine,
        );

        nodesInRange.forEach((node) =>
          matchingNodes.push({ node, templatePart: part }),
        );
      } catch (error) {
        this.logger.warn(`Could not read file: ${part.fileFullPath}, ${error}`);
      }
    }

    this.logger.debug(
      `Found ${matchingNodes.length} references for translation key: ${translationKey} across ${templateParts.length} template parts`,
    );
    return matchingNodes;
  }
}
