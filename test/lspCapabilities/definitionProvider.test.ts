import { DefinitionProvider } from "../../src/lspCapabilities/definitionProvider";
import { DefinitionParams } from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import * as path from "path";

describe("DefinitionProvider - Go to Definitions - Include Tags", () => {
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
