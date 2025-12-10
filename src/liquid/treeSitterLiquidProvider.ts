import * as Parser from "tree-sitter";
import * as LiquidTreeSitter from "tree-sitter-liquid";

// Re-export commonly used tree-sitter types
export type { SyntaxNode, Tree, Point, QueryMatch } from "tree-sitter";
export type TreeSitterParser = Parser;

/**
 * Provides tree-sitter parsing for Liquid templates.
 *
 * Note: This class CANNOT be a singleton. Tree-sitter Parser instances are not thread-safe
 * and cannot be used concurrently. Each class that needs parsing should create its own instance.
 */
export class TreeSitterLiquidProvider {
  private parser: Parser;
  private language: Parser.Language;
  private isInitialized = false;

  constructor() {
    try {
      this.parser = new Parser();
      this.language = LiquidTreeSitter as Parser.Language;
      this.parser.setLanguage(this.language);
      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Parse liquid template text into a syntax tree.
   *
   * @param text The liquid template text to parse
   * @returns The parsed syntax tree, or null if parsing fails
   */
  public parseTree(text: string): Parser.Tree | null {
    if (!this.isInitialized) {
      return null;
    }
    return this.parser.parse(text);
  }

  public queryTree(
    queryString: string,
    tree: Parser.Tree,
  ): Parser.QueryMatch[] {
    if (!this.isInitialized || !tree) {
      return [];
    }
    const query = new Parser.Query(this.language, queryString);

    return query.matches(tree.rootNode);
  }
}
