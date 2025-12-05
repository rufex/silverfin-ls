import { DefinitionProvider } from "../../src/lspCapabilities/definitionProvider";
import { DefinitionParams } from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import * as path from "path";

describe("DefinitionProvider - Go to Definitions - Include Tag Navigation", () => {
  const fixturesPath = path.resolve(__dirname, "../../fixtures/market-repo");
  const mainFilePath = path.join(
    fixturesPath,
    "reconciliation_texts/include_parts_test/main.liquid",
  );
  const included1Path = path.join(
    fixturesPath,
    "reconciliation_texts/include_parts_test/text_parts/included_1.liquid",
  );
  const included2Path = path.join(
    fixturesPath,
    "reconciliation_texts/include_parts_test/text_parts/included_2.liquid",
  );
  const includedSharedOnePath = path.join(
    fixturesPath,
    "shared_parts/included_shared_1/included_shared_1.liquid",
  );
  const includedSharedTwoPath = path.join(
    fixturesPath,
    "shared_parts/included_shared_2/included_shared_2.liquid",
  );

  describe("Include Tag - Text Parts Navigation", () => {
    it("should navigate from main (reconciliation text) to text part", async () => {
      // triggered from
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 5, character: 15 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].uri).toContain(included1Path);
      expect(result![0].range.start).toEqual({ line: 0, character: 0 });
    });

    it("should navigate from text part to text part", async () => {
      // triggered from
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(included1Path).toString() },
        position: { line: 3, character: 15 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].uri).toContain(included2Path);
      expect(result![0].range.start).toEqual({ line: 0, character: 0 });
    });

    it("should return null when cursor is not on an include tag", async () => {
      // triggered from
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 0, character: 0 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).toBeNull();
    });
  });

  describe("Include Tag - Shared Parts Navigation", () => {
    it("should navigate from main (reconciliation text) to shared part", async () => {
      // triggered from
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 11, character: 20 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].uri).toContain(includedSharedOnePath);
      expect(result![0].range.start).toEqual({ line: 0, character: 0 });
    });

    it("should navigate from text part to shared part", async () => {
      // triggered from
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(included1Path).toString() },
        position: { line: 5, character: 20 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].uri).toContain(includedSharedTwoPath);
      expect(result![0].range.start).toEqual({ line: 0, character: 0 });
    });

    it("should navigate from shared part to another shared part", async () => {
      // triggered from
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(includedSharedOnePath).toString() },
        position: { line: 1, character: 20 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].uri).toContain(includedSharedTwoPath);
      expect(result![0].range.start).toEqual({ line: 0, character: 0 });
    });
  });

  describe("no definitions available", () => {
    it("should handle non-existent files gracefully", async () => {
      const nonExistentPath = path.join(
        fixturesPath,
        "reconciliation_texts/non_existent/main.liquid",
      );

      const params: DefinitionParams = {
        textDocument: { uri: URI.file(nonExistentPath).toString() },
        position: { line: 0, character: 0 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      await expect(provider.handleDefinitionRequest()).rejects.toThrow();
    });

    it("should return null when cursor is not on top of an include tag", async () => {
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 1, character: 10 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).toBeNull();
    });

    it("should return null for include tag pointing to non-existent file", async () => {
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 13, character: 0 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).toBeNull();
    });
  });
});

describe("DefinitionProvider - Translation Tag Navigation", () => {
  const fixturesPath = path.resolve(__dirname, "../../fixtures/market-repo");
  const mainFilePath = path.join(
    fixturesPath,
    "reconciliation_texts/translation_test/main.liquid",
  );
  const textPartPath = path.join(
    fixturesPath,
    "reconciliation_texts/translation_test/text_parts/translations_def.liquid",
  );
  const sharedPartPath = path.join(
    fixturesPath,
    "shared_parts/translation_shared/translation_shared.liquid",
  );

  describe("Translation Tag - Definition in Same File", () => {
    it("should find translation definition in the same file (main.liquid)", async () => {
      // Line 2: {% t= "key_from_main" ... %} - definition
      // Line 6: {% t "key_from_main" %} - usage
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 6, character: 7 }, // Cursor on "key_from_main" in usage
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(2);
    });
  });

  describe("Translation Tag - Definition in Text Part", () => {
    it("should find translation definition in included text part", async () => {
      // Text part - defines: {% t= "key_from_text_part" ... %}
      // Main part - calls: {% t "key_from_text_part" %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 7, character: 7 }, // Cursor on "key_from_text_part"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].uri).toContain(textPartPath);
      expect(result![0].range.start.line).toBe(2); // Line 3 (0-indexed = 2)
    });
  });

  describe("Translation Tag - Definition in Shared Part", () => {
    it("should find translation definition in shared part from main template", async () => {
      // Shared part - defines: {% t= "key_from_shared" ... %}
      // Main part - calls: {% t "key_from_shared" %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 8, character: 7 }, // Cursor on "key_from_shared"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].uri).toContain(sharedPartPath);
      expect(result![0].range.start.line).toBe(2);
    });

    it("should find translation definition in shared part from text part", async () => {
      // Shared part - defines: {% t= "key_from_shared" ... %}
      // Text part - calls: {% t "key_from_shared" %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(textPartPath).toString() },
        position: { line: 6, character: 7 }, // Cursor on "key_from_shared"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].uri).toContain(sharedPartPath);
    });
  });

  describe("Translation Tag - Undefined Keys", () => {
    it("should return null for undefined translation keys", async () => {
      // Line 9: {% t "undefined_key" %} - no definition exists
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 9, character: 7 }, // Cursor on "undefined_key"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      // Should return empty array or null when no definition is found
      expect(result === null || result.length === 0).toBe(true);
    });

    it("should not find definitions that appear AFTER the usage (scope rule)", async () => {
      // Line 10: {% t "key_defined_after" %} - usage
      // Line 12: {% t= "key_defined_after" ... %} - definition AFTER usage
      // Should NOT find this definition because it appears after the usage
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 10, character: 7 }, // Cursor on "key_defined_after"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      // Should return empty array or null since definition is after usage
      expect(result === null || result.length === 0).toBe(true);
    });
  });

  describe("Translation Tag - Edge Cases", () => {
    it("should return null when cursor is not on a translation tag", async () => {
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 0, character: 5 }, // Position on comment
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).toBeNull();
    });
  });
});
