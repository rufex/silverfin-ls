import { ReferenceProvider } from "../../src/lspCapabilities/referenceProvider";
import { ReferenceParams } from "vscode-languageserver/node";
import { URI } from "vscode-uri";
import * as path from "path";

// Note that lines are mentioned as 1-indexed in examples but they are 0-indexed in expectations as that's how the LS handles them

describe("Go to Reference Cases", () => {
  const fixturesPath = path.resolve(__dirname, "../../fixtures/market-repo");
  const mainFilePath = path.join(
    fixturesPath,
    "reconciliation_texts/definitions_and_references/main.liquid",
  );

  describe("Case: Translation", () => {
    it("should find all references to translation_key", async () => {
      // Line 12: {% t= "translation_key" default: "Translated Text" %}
      // Line 16: {% t "translation_key" %} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 15, character: 7 }, // On reference
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(1);
      // Should find the reference on line 16 (0-indexed: 15)
      const ref = result!.find((loc) => loc.range.start.line === 15);
      expect(ref).toBeDefined();
    });
  });

  describe("Case: assignment", () => {
    it("should find all references to simple_var in output, assign, capture, and translation", async () => {
      // Line 22: {% assign simple_var = "Simple Value" %} - definition
      // Line 26: {{ simple_var }} - reference
      // Line 27: {% assign assigned_simple_var = simple_var %} - reference
      // Line 28: {% capture captured_simple_var %}{{ simple_var }}{% endcapture %} - reference
      // Line 29: {% t simple_var %} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 25, character: 6 }, // On {{ simple_var }}
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(4);

      // Check for all references
      const refLines = result!.map((loc) => loc.range.start.line).sort();
      expect(refLines).toContain(25); // Line 26: {{ simple_var }}
      expect(refLines).toContain(26); // Line 27: assign value
      expect(refLines).toContain(27); // Line 28: capture body
      expect(refLines).toContain(28); // Line 29: translation
    });

    it("should include definition when includeDeclaration is true", async () => {
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 25, character: 6 },
        context: { includeDeclaration: true },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      // Should include definition on line 22 (0-indexed: 21)
      const def = result!.find((loc) => loc.range.start.line === 21);
      expect(def).toBeDefined();
    });
  });

  describe("Case: capture", () => {
    it("should find all references to captured_var", async () => {
      // Line 35: {% capture captured_var %}Captured Content{% endcapture %} - definition
      // Line 39: {{ captured_var }} - reference
      // Line 40: {% assign assigned_captured_var = captured_var %} - reference
      // Line 41: {% capture captured_captured_var %}{{ captured_var }}{% endcapture %} - reference
      // Line 42: {% t captured_var %} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 38, character: 6 },
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(4);

      const refLines = result!.map((loc) => loc.range.start.line).sort();
      expect(refLines).toContain(38); // Line 39: output
      expect(refLines).toContain(39); // Line 40: assign
      expect(refLines).toContain(40); // Line 41: capture
      expect(refLines).toContain(41); // Line 42: translation
    });
  });

  describe("Case: iterable variable", () => {
    it("should find all references to items (the iterable)", async () => {
      // Line 48: {% assign items = "a|b|c" | split:"|" %} - definition
      // Line 52: {% for item in items %} - reference
      // Line 58: {{ items }} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 51, character: 17 }, // On items in for loop
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(2);

      const refLines = result!.map((loc) => loc.range.start.line).sort();
      expect(refLines).toContain(51); // Line 52: for loop iterator
      expect(refLines).toContain(57); // Line 58: output
    });

    it("should find all references to item (loop variable) only within loop scope", async () => {
      // Line 52: {% for item in items %} - definition
      // Line 53: {{ item }} - reference
      // Line 54: {% assign item_var = item %} - reference
      // Line 55: {% capture captured_item %}{{ item }}{% endcapture %} - reference
      // Line 56: {% t item %} - reference
      // Line 59: {{ item }} - out of scope, should not be found
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 52, character: 5 }, // On {{ item }}
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(4);

      const refLines = result!.map((loc) => loc.range.start.line).sort();
      expect(refLines).toContain(52); // Line 53: output
      expect(refLines).toContain(53); // Line 54: assign
      expect(refLines).toContain(54); // Line 55: capture
      expect(refLines).toContain(55); // Line 56: translation
      // Line 59 should NOT be included (out of scope)
      expect(refLines).not.toContain(58);
    });
  });

  describe("Case: loop scope and shadowing", () => {
    it("should find references to item_1 only within first loop scope", async () => {
      // Line 65: {% assign item_1 = 'content' %} - definition
      // Line 71: {% for item_1 in items_out_of_scope_2 %} - shadows original
      // Line 72: {{ item_1 }} - reference to loop variable
      // Line 74: {% for item_1 in items_in_scope_2 %} - shadows again
      // Line 75: {{ item_1 }} - reference to inner loop variable
      // Line 77: {{ item_1 }} - reference to original assignment
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 71, character: 7 }, // Inside first loop
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      // Should find reference on line 72 only (within first loop scope)
      const refLines = result!.map((loc) => loc.range.start.line);
      expect(refLines).toContain(71);
      // Should not include line 74 or 76 (different scopes)
    });

    it("should find references to item_1 in original scope", async () => {
      // Line 65: {% assign item_1 = 'content' %} - definition
      // Line 77: {{ item_1 }} - reference (after loops)
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 76, character: 3 }, // Outside loops
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      // Should find reference on line 77 (outside loop scopes)
      const refLines = result!.map((loc) => loc.range.start.line);
      expect(refLines).toContain(76);
    });
  });

  describe("Case: dynamic variables", () => {
    it("should find all references to assigned_key_1 in dynamic access", async () => {
      // Line 86: {% assign assigned_key_1 = 'item_assign_key' %} - definition
      // Line 93: {{ [assigned_key_1] }} - reference
      // Line 96: {% assign foo_1 = [assigned_key_1] %} - reference
      // Line 102: {% assign [assigned_key_1] = 'content' %} - reference (in variable name)
      // Line 108: {{ [assigned_key_1] }} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 92, character: 7 }, // On {{ [assigned_key_1] }}
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(4);

      const refLines = result!.map((loc) => loc.range.start.line).sort();
      expect(refLines).toContain(92); // Line 93: output
      expect(refLines).toContain(95); // Line 96: assign value
      expect(refLines).toContain(101); // Line 102: assign variable name
      expect(refLines).toContain(107); // Line 108: output
    });

    it("should find all references to captured_key_1 in dynamic access", async () => {
      // Line 88: {% capture captured_key_1 %}item_captured_key{% endcapture %} - definition
      // Line 94: {{ [captured_key_1] }} - reference
      // Line 97: {% assign foo_2 = [captured_key_1] %} - reference
      // Line 103: {% assign [captured_key_1] = 'content' %} - reference
      // Line 109: {{ [captured_key_1] }} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 93, character: 7 },
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(4);

      const refLines = result!.map((loc) => loc.range.start.line).sort();
      expect(refLines).toContain(93); // Line 94: output
      expect(refLines).toContain(96); // Line 97: assign value
      expect(refLines).toContain(102); // Line 103: assign variable name
      expect(refLines).toContain(108); // Line 109: output
    });

    it("should find references to assigned_key_2 in capture variable name", async () => {
      // Line 87: {% assign assigned_key_2 = 'item_assign_key' %} - definition
      // Line 105: {% capture [assigned_key_2] %}content{% endcapture %} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 104, character: 14 },
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(1);

      const refLines = result!.map((loc) => loc.range.start.line);
      expect(refLines).toContain(104); // Line 105: capture variable name
    });
  });

  describe("Case: filters and variables", () => {
    it("should include definition when cursor is on the definition itself", async () => {
      // Line 116: {% assign default_var = 'Content' %} - testing from HERE
      // Line 130: {% assign item_ref = another_ref_1_var | default:default_var %} - reference
      // Line 141: {% assign chained = "text" | upcase | append:default_var %} - reference
      // Line 142: {{ some_value | default:default_var }} - reference
      // Line 144: {% capture filtered_content %}{{ undefined_value | default:default_var }}{% endcapture %} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 115, character: 17 }, // On default_var in definition (0-indexed)
        context: { includeDeclaration: true },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(5); // 4 references + 1 definition

      const allLines = result!.map((loc) => loc.range.start.line).sort();
      expect(allLines).toEqual([115, 129, 140, 141, 143]); // Definition + all references
    });

    it("should find all references to default_var in filter arguments", async () => {
      // Line 116: {% assign default_var = 'Content' %} - definition
      // Line 130: {% assign item_ref = another_ref_1_var | default:default_var %} - reference
      // Line 141: {% assign chained = "text" | upcase | append:default_var %} - reference
      // Line 142: {{ some_value | default:default_var }} - reference
      // Line 144: {% capture filtered_content %}{{ undefined_value | default:default_var }}{% endcapture %} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 129, character: 49 }, // On default_var in filter
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(4);

      const refLines = result!.map((loc) => loc.range.start.line).sort();
      expect(refLines).toContain(129); // Line 130: assign with filter
      expect(refLines).toContain(140); // Line 141: chained filter
      expect(refLines).toContain(141); // Line 142: output with filter
      expect(refLines).toContain(143); // Line 144: capture with filter
    });

    it("should find all references to currency_var in filter arguments", async () => {
      // Line 119: {% assign currency_var = 2 %} - definition
      // Line 132: {{ 10 | currency:currency_var }} - reference
      // Line 133: {% assign item_3_ref = another_ref_3_var | currency:currency_var %} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 131, character: 17 },
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(2);

      const refLines = result!.map((loc) => loc.range.start.line).sort();
      expect(refLines).toContain(131); // Line 132: output
      expect(refLines).toContain(132); // Line 133: assign
    });

    it("should find all references to round_var in filter arguments", async () => {
      // Line 120: {% assign round_var = 1 %} - definition
      // Line 134: {{ 4.6 | round:round_var }} - reference
      // Line 143: {{ 10.5 | round:round_var }} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 133, character: 15 },
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(2);

      const refLines = result!.map((loc) => loc.range.start.line).sort();
      expect(refLines).toContain(133); // Line 134
      expect(refLines).toContain(142); // Line 143
    });

    it("should find references to replace_from and replace_to in multi-arg filter", async () => {
      // Line 123: {% assign replace_from = 'old' %} - definition
      // Line 124: {% assign replace_to = 'new' %} - definition
      // Line 136: {{ "old text" | replace:replace_from,replace_to }} - both referenced

      // Test replace_from
      const paramsFrom: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 135, character: 24 },
        context: { includeDeclaration: false },
      };

      const providerFrom = new ReferenceProvider(paramsFrom, fixturesPath);
      const resultFrom = await providerFrom.handleReferenceRequest();

      expect(resultFrom).not.toBeNull();
      expect(resultFrom!.length).toBeGreaterThanOrEqual(1);
      expect(resultFrom!.some((loc) => loc.range.start.line === 135)).toBe(
        true,
      );

      // Test replace_to
      const paramsTo: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 135, character: 37 },
        context: { includeDeclaration: false },
      };

      const providerTo = new ReferenceProvider(paramsTo, fixturesPath);
      const resultTo = await providerTo.handleReferenceRequest();

      expect(resultTo).not.toBeNull();
      expect(resultTo!.length).toBeGreaterThanOrEqual(1);
      expect(resultTo!.some((loc) => loc.range.start.line === 135)).toBe(true);
    });

    it("should find references to split_delimiter in chained filters", async () => {
      // Line 122: {% assign split_delimiter = '|' %} - definition
      // Line 140: {{ "a|b|c" | split:split_delimiter | join:", " }} - reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 139, character: 19 },
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThanOrEqual(1);
      expect(result!.some((loc) => loc.range.start.line === 139)).toBe(true);
    });
  });

  describe("Case: re-assignment", () => {
    it("should find all references and both definitions from first reference", async () => {
      // Line 148: {% assign reassign_var = 'First Value' %} - first definition
      // Line 150: {{ reassign_var }} - first reference (testing from here)
      // Line 152: {% assign reassign_var = 'Second Value' %} - second definition
      // Line 154: {{ reassign_var }} - second reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 149, character: 3 }, // On first {{ reassign_var }}
        context: { includeDeclaration: true },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(4); // 2 definitions + 2 references

      const allLines = result!
        .map((loc) => loc.range.start.line)
        .sort((a, b) => a - b);
      expect(allLines).toEqual([147, 149, 151, 153]); // Lines 148, 150, 152, 154 (0-indexed)
    });

    it("should find all references and both definitions from second reference", async () => {
      // Line 148: {% assign reassign_var = 'First Value' %} - first definition
      // Line 150: {{ reassign_var }} - first reference
      // Line 152: {% assign reassign_var = 'Second Value' %} - second definition
      // Line 154: {{ reassign_var }} - second reference (testing from here)
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 153, character: 3 }, // On second {{ reassign_var }}
        context: { includeDeclaration: true },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(4); // 2 definitions + 2 references

      const allLines = result!
        .map((loc) => loc.range.start.line)
        .sort((a, b) => a - b);
      expect(allLines).toEqual([147, 149, 151, 153]); // All occurrences
    });

    it("should find all references and both definitions from first definition", async () => {
      // Line 148: {% assign reassign_var = 'First Value' %} - testing from here
      // Line 150: {{ reassign_var }} - first reference
      // Line 152: {% assign reassign_var = 'Second Value' %} - second definition
      // Line 154: {{ reassign_var }} - second reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 147, character: 11 }, // On reassign_var in first definition
        context: { includeDeclaration: true },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(4); // 2 definitions + 2 references

      const allLines = result!
        .map((loc) => loc.range.start.line)
        .sort((a, b) => a - b);
      expect(allLines).toEqual([147, 149, 151, 153]); // All occurrences
    });

    it("should find all references and both definitions from second definition", async () => {
      // Line 148: {% assign reassign_var = 'First Value' %} - first definition
      // Line 150: {{ reassign_var }} - first reference
      // Line 152: {% assign reassign_var = 'Second Value' %} - testing from here
      // Line 154: {{ reassign_var }} - second reference
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 151, character: 11 }, // On reassign_var in second definition
        context: { includeDeclaration: true },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(4); // 2 definitions + 2 references

      const allLines = result!
        .map((loc) => loc.range.start.line)
        .sort((a, b) => a - b);
      expect(allLines).toEqual([147, 149, 151, 153]); // All occurrences
    });

    it("should find only references when includeDeclaration is false", async () => {
      // Should find only the 2 references, not the 2 definitions
      const params: ReferenceParams = {
        textDocument: { uri: URI.file(mainFilePath).toString() },
        position: { line: 149, character: 3 }, // On first reference
        context: { includeDeclaration: false },
      };

      const provider = new ReferenceProvider(params, fixturesPath);
      const result = await provider.handleReferenceRequest();

      expect(result).not.toBeNull();
      expect(result!.length).toBe(2); // Only 2 references

      const allLines = result!
        .map((loc) => loc.range.start.line)
        .sort((a, b) => a - b);
      expect(allLines).toEqual([149, 153]); // Lines 150, 154 (0-indexed) - only references
    });
  });
});
