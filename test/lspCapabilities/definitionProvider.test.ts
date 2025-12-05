import { DefinitionProvider } from "../../src/lspCapabilities/definitionProvider";
import { DefinitionParams } from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import * as path from "path";

describe("DefinitionProvider - Include tags", () => {
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

describe("DefinitionProvider - Translation Tags", () => {
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

describe("DefinitionProvider - Variables", () => {
  const fixturesPath = path.resolve(__dirname, "../../fixtures/market-repo");
  const mainFilePath = path.join(
    fixturesPath,
    "reconciliation_texts/variable_definition_test/main.liquid",
  );
  const textPartPath = path.join(
    fixturesPath,
    "reconciliation_texts/variable_definition_test/text_parts/definitions.liquid",
  );
  const sharedPartPath = path.join(
    fixturesPath,
    "shared_parts/variable_shared/variable_shared.liquid",
  );

  describe("Assign Statement", () => {
    it("should find variable definition from assign in output {{ }}", async () => {
      // Line 4: {% assign simple_var = "Simple Value" %}
      // Line 18: {{ simple_var }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 20, character: 6 }, // Line 21, cursor on "simple_var"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(3);
    });

    it("should find variable definition from assign in assign value", async () => {
      // Line 4: {% assign simple_var = "Simple Value" %}
      // Line 19: {% assign assigned_simple_var = simple_var %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 21, character: 40 }, // Line 22, cursor on "simple_var" in assign
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(3);
    });

    xit("should find variable in capture content", async () => {
      // Line 4: {% assign simple_var = "Simple Value" %}
      // Line 20: {% capture captured_simple_var %}{{ simple_var }}{% endcapture %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 22, character: 43 }, // Line 23, cursor on "simple_var" in capture
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      // #TODO: Variables in capture content are not currently supported
      expect(result).not.toBeNull();
    });
  });

  describe("Capture Statement", () => {
    it("should find variable definition from capture in output {{ }}", async () => {
      // Line 7: {% capture captured_var %}...{% endcapture %}
      // Line 21: {{ captured_var }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 23, character: 6 }, // Line 24, cursor on "captured_var"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(5);
    });

    it("should find variable definition from capture in assign value", async () => {
      // Line 7: {% capture captured_var %}...{% endcapture %}
      // Line 25: {% assign assigned_captured_var = captured_var %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 24, character: 36 }, // Line 25, cursor on "captured_var"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(5);
    });

    xit("should find variable in capture content", async () => {
      // Line 7: {% capture captured_var %}...{% endcapture %}
      // Line 26: {% capture captured_captured_var %}{{ captured_var %}{% endcapture %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 25, character: 47 }, // Line 26, cursor on "captured_var" in capture
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      // #TODO: Variables in capture content are not currently supported
      expect(result).not.toBeNull();
    });
  });

  describe("Variable - For Loop Iterator", () => {
    it("should find iterator variable definition (items in 'for item in items')", async () => {
      // Line 10: {% assign items = "a,b,c" | split: "," %}
      // Line 11: {% for loop_var in items %}
      // Navigate from "items" (iterator) in the for loop to its definition
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 10, character: 23 }, // Line 11, cursor on "items" in for loop
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(9);
    });

    it("should find iterator variable definition in output statement", async () => {
      // Line 10: {% assign items = "a,b,c" | split: "," %}
      // Line 18: {{ items }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 17, character: 6 }, // Line 18, cursor on "items"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      expect(result![0].uri).toContain(mainFilePath);
      expect(result![0].range.start.line).toBe(9);
    });
  });

  describe("Variable - For Loop Variable", () => {
    xit("should find loop variable definition", async () => {
      // Line 11: {% for loop_var in items %}
      // Line 12: {{ loop_var }}
      // Loop variables are defined inline in the for statement
      // Current implementation doesn't support finding them
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 11, character: 6 }, // Line 12, cursor on "loop_var"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      // #TODO: Loop variable definitions are not currently supported
      expect(result).not.toBeNull();
    });
  });

  describe("Definition in Text Part", () => {
    it("should find variable defined in included text part in output {{ }}", async () => {
      // Text part line 3: {% assign text_part_var = "From Text Part" %}
      // Main file line 30: {{ text_part_var }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 29, character: 6 }, // Line 30, cursor on "text_part_var"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      expect(result![0].uri).toContain(textPartPath);
      expect(result![0].range.start.line).toBe(2);
    });

    it("should find variable defined in included text part in assign value", async () => {
      // Text part line 3: {% assign text_part_var = "From Text Part" %}
      // Main file line 31: {% assign assigned_text_part_var = text_part_var %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 30, character: 45 }, // Line 31, cursor on "text_part_var" in assign
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      expect(result![0].uri).toContain(textPartPath);
      expect(result![0].range.start.line).toBe(2);
    });

    xit("should find variable in capture content", async () => {
      // Text part line 3: {% assign text_part_var = "From Text Part" %}
      // Main file line 32: {% capture captured_text_part_var %}{{ text_part_var }}{% endcapture %}
      // Variables inside capture blocks are not currently identified
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 31, character: 48 }, // Line 32, cursor on "text_part_var" in capture
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      // #TODO: Variables in capture content are not currently supported
      expect(result).not.toBeNull();
    });
  });

  describe("Variable - Definition in Shared Part", () => {
    it("should find variable defined in included shared part in output {{ }}", async () => {
      // Shared part line 3: {% assign shared_var = "From Shared Part" %}
      // Main file line 36: {{ shared_var }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 35, character: 6 }, // Line 36, cursor on "shared_var"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      expect(result![0].uri).toContain(sharedPartPath);
      expect(result![0].range.start.line).toBe(2); // Line 3 (0-indexed = 2)
    });

    it("should find variable defined in included shared part in assign value", async () => {
      // Shared part line 3: {% assign shared_var = "From Shared Part" %}
      // Main file line 37: {% assign assigned_shared_var = shared_var %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 36, character: 41 }, // Line 37, cursor on "shared_var" in assign
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
      expect(result![0].uri).toContain(sharedPartPath);
      expect(result![0].range.start.line).toBe(2);
    });
  });

  describe("Variable - Scope Rules", () => {
    it("should NOT find variable defined after usage (scope rule)", async () => {
      // Line 40: {{ undefined_var }} - usage
      // Line 41: {% assign undefined_var = "Defined After" %} - definition after
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 39, character: 6 }, // Line 40, cursor on "undefined_var"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      // Should return null or empty array since definition is after usage
      expect(result === null || result.length === 0).toBe(true);
    });
  });

  describe("Variable - Multiple Definitions", () => {
    it("should find all definitions of variable with multiple assignments in output {{ }}", async () => {
      // Line 44: {% assign multi_var = "First Definition" %}
      // Line 45: {% assign multi_var = "Second Definition" %}
      // Line 46: {{ multi_var }}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 45, character: 6 }, // Line 46, cursor on "multi_var"
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      // Should find both definitions before the usage
      expect(result!.length).toBeGreaterThanOrEqual(2);
      expect(result![0].range.start.line).toBe(43); // First definition (line 44, 0-indexed = 43)
      expect(result![1].range.start.line).toBe(44); // Second definition (line 45, 0-indexed = 44)
    });

    it("should find all definitions of variable with multiple assignments in assign value", async () => {
      // Line 44: {% assign multi_var = "First Definition" %}
      // Line 45: {% assign multi_var = "Second Definition" %}
      // Line 47: {% assign assigned_multi_var = multi_var %}
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 46, character: 35 }, // Line 47, cursor on "multi_var" in assign value
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(2);
      expect(result![0].range.start.line).toBe(43);
      expect(result![1].range.start.line).toBe(44);
    });

    xit("should NOT find variable in capture content (limitation: variables in capture not supported)", async () => {
      // Line 44: {% assign multi_var = "First Definition" %}
      // Line 45: {% assign multi_var = "Second Definition" %}
      // Line 48: {% capture captured_multi_var %}{{ multi_var }}{% endcapture %}
      // Variables inside capture blocks are not currently identified
      const params: DefinitionParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 47, character: 44 }, // Line 48, cursor on "multi_var" in capture
      };

      const provider = new DefinitionProvider(params, fixturesPath);
      const result = await provider.handleDefinitionRequest();

      // #TODO: Variables in capture content are not currently supported
      expect(result).not.toBeNull();
    });
  });

  describe("Variable - Edge Cases", () => {
    it("should return null when cursor is not on a variable", async () => {
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
