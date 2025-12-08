import { DefinitionProvider } from "../../src/lspCapabilities/definitionProvider";
import { DefinitionParams } from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import * as path from "path";

// Note that lines are mentioned as 1-indexed in examples but they are 0-indexed in expectations as that's how the LS handles them
// #NOTE: Go to References are not supported yet but same examples could be used eventually

describe("Go to Definition Cases - Definitions", () => {
  const fixturesPath = path.resolve(__dirname, "../../fixtures/market-repo");
  const mainFilePath = path.join(
    fixturesPath,
    "reconciliation_texts/definitions_and_references/main.liquid",
  );

  describe("Case: Translation", () => {
    it("should find translation_key in translation expression", async () => {
      // Line 12: {% t= "translation_key" default: "Translated Text" %}
      // Line 16: {% t "translation_key" %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 15, character: 7 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(11);
    });
  });

  describe("Case: assignment", () => {
    it("should find simple_var definition in output {{  }}", async () => {
      // Line 22: {% assign simple_var = "Simple Value" %}
      // Line 26: {{ simple_var }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 25, character: 6 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(21);
    });

    it("should find simple_var definition in an assignment statement", async () => {
      // Line 22: {% assign simple_var = "Simple Value" %}
      // Line 27: {% assign assigned_simple_var = simple_var %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 26, character: 40 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(21);
    });

    it("should find simple_var definition in capture statement body", async () => {
      // Line 22: {% assign simple_var = "Simple Value" %}
      // Line 28: {% capture captured_simple_var %}{{ simple_var }}{% endcapture %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 27, character: 43 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(21);
    });

    it("should find simple_var definition in translation expression", async () => {
      // Line 22: {% assign simple_var = "Simple Value" %}
      // Line 29: {% t simple_var %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 28, character: 7 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(21);
    });
  });

  describe("Case: capture", () => {
    it("should find captured_var definition in output {{ }}", async () => {
      // Line 35: {% capture captured_var %}Captured Content{% endcapture %}
      // Line 39: {{ captured_var }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 38, character: 6 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(34);
    });

    it("should find captured_var definition in an assignment statement", async () => {
      // Line 35: {% capture captured_var %}Captured Content{% endcapture %}
      // Line 40: {% assign assigned_captured_var = captured_var %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 39, character: 41 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(34);
    });

    it("should find captured_var definition in a capture statement body", async () => {
      // Line 35: {% capture captured_var %}Captured Content{% endcapture %}
      // Line 41: {% capture captured_captured_var %}{{ captured_var }}{% endcapture %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 40, character: 47 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(34);
    });

    it("should find captured_var definition in a translation expression", async () => {
      // Line 35: {% capture captured_var %}Captured Content{% endcapture %}
      // Line 42: {% t captured_var %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 41, character: 7 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(34);
    });
  });

  describe("Case: iterable variable", () => {
    it("should find items iterable in for loop statement", async () => {
      // Line 48: {% assign items = "a|b|c" | split:"|" %}
      // Line 52: {% for item in items %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 51, character: 17 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(47);
    });

    it("should find item iterator variable in output {{  }}", async () => {
      // Line 52: {% for item in items %}
      // Line 53: {{ item }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 52, character: 5 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(51);
    });

    it("should find item iterator variable in an assignment statement", async () => {
      // Line 52: {% for item in items %}
      // Line 54: {% assign item_var = item %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 53, character: 26 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(51);
    });

    it("should find item iterator variable in a capture statement body", async () => {
      // Line 52: {% for item in items %}
      // Line 55: {% capture captured_item %}{{ item }}{% endcapture %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 54, character: 32 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(51);
    });

    it("should find the iterable variable outside of the for loop statement", async () => {
      // Line 48: {% assign items = "a|b|c" | split:"|" %}
      // Line 58: {{ items }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 57, character: 6 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(47);
    });

    it("should not find the iterator variable outside of the for loop statement", async () => {
      // Line 52: {% for item in items %}
      // Line 59: {{ item }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 58, character: 6 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).toBeNull();
    });
  });

  describe("Case: loop scope", () => {
    it("should find loop iterator in first loop with shadowed variable", async () => {
      // Line 65: {% assign item_1 = 'content' %}
      // Line 71: {% for item_1 in items_out_of_scope_2 %}
      // Line 72: {{ item_1 }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 71, character: 7 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(70);
    });

    it("should find loop iterator in second loop with same variable name", async () => {
      // Line 65: {% assign item_1 = 'content' %}
      // Line 71: {% for item_1 in items_out_of_scope_2 %}
      // Line 74: {% for item_1 in items_in_scope_2 %}
      // Line 75: {{ item_1 }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 74, character: 7 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(73);
    });

    it("should find original assignment when variable is used outside all loops", async () => {
      // Line 65: {% assign item_1 = 'content' %}
      // Line 71: {% for item_1 in items_out_of_scope_2 %}
      // Line 74: {% for item_1 in items_in_scope_2 %}
      // Line 77: {{ item_1 }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 76, character: 3 },
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(64);
    });
  });
});
