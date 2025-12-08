import { Logger } from "../logger";
import * as Parser from "tree-sitter";
import { TreeSitterLiquidProvider } from "./treeSitterLiquidProvider";
import * as fs from "fs";
import { TemplatePartsCollectionManager } from "../templates/templatePartsCollectionManager";

interface NodeInTemplate {
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
      this.logger.warn(`No template parts found for URI: ${textDocumentUri}`);
      return null;
    }
    const { templateParts, currentFileIndex } = templateDetails;

    if (!templateParts || currentFileIndex === -1) {
      this.logger.warn(`No template parts found for URI: ${textDocumentUri}`);
      return null;
    }

    this.logger.info("Parts identified: " + templateParts.length);

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
      this.logger.warn(`No template parts found for URI: ${textDocumentUri}`);
      return null;
    }
    const { templateParts, currentFileIndex } = templateDetails;

    if (!templateParts || currentFileIndex === -1) {
      this.logger.warn(`No template parts found for URI: ${textDocumentUri}`);
      return null;
    }

    this.logger.info("Parts identified: " + templateParts.length);

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
}
