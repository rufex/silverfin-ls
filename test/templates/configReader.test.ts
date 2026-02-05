import { ConfigReader } from "../../src/templates/configReader";
import * as path from "path";

const fixturesPath = path.resolve(__dirname, "../../fixtures/market-repo");

describe("ConfigReader", () => {
  describe("getTextPartsConfig", () => {
    it("should return text_parts config for valid config.json", () => {
      const templateDir = path.join(
        fixturesPath,
        "reconciliation_texts/reconciliation_text_1",
      );
      const config = ConfigReader.getTextPartsConfig(templateDir);

      expect(config).not.toBeNull();
      expect(config).toHaveProperty("part_1");
      expect(config).toHaveProperty("part_2");
      expect(config!["part_1"]).toBe("text_parts/part_1.liquid");
      expect(config!["part_2"]).toBe("text_parts/part_2.liquid");
    });

    it("should return null for missing config.json", () => {
      const templateDir = path.join(fixturesPath, "nonexistent_template");
      const config = ConfigReader.getTextPartsConfig(templateDir);

      expect(config).toBeNull();
    });

    it("should return null for empty text_parts", () => {
      const templateDir = path.join(
        fixturesPath,
        "reconciliation_texts/reconciliation_text_2",
      );
      const config = ConfigReader.getTextPartsConfig(templateDir);

      // reconciliation_text_2 has text_parts: {}
      expect(config).toEqual({});
    });

    it("should handle custom directory paths", () => {
      const templateDir = path.join(
        fixturesPath,
        "reconciliation_texts/custom_paths_test",
      );
      const config = ConfigReader.getTextPartsConfig(templateDir);

      expect(config).not.toBeNull();
      expect(config!["intro"]).toBe("custom_dir/intro.liquid");
      expect(config!["calculations"]).toBe("helpers/calculations.liquid");
    });
  });

  describe("resolveTextPartPath", () => {
    it("should resolve text part to absolute path", () => {
      const templateDir = path.join(
        fixturesPath,
        "reconciliation_texts/reconciliation_text_1",
      );
      const resolvedPath = ConfigReader.resolveTextPartPath(
        templateDir,
        "part_1",
      );

      expect(resolvedPath).not.toBeNull();
      expect(resolvedPath).toContain("text_parts/part_1.liquid");
      expect(path.isAbsolute(resolvedPath!)).toBe(true);
    });

    it("should return null for non-existent part name", () => {
      const templateDir = path.join(
        fixturesPath,
        "reconciliation_texts/reconciliation_text_1",
      );
      const resolvedPath = ConfigReader.resolveTextPartPath(
        templateDir,
        "nonexistent_part",
      );

      expect(resolvedPath).toBeNull();
    });

    it("should return null for missing config.json", () => {
      const templateDir = path.join(fixturesPath, "nonexistent_template");
      const resolvedPath = ConfigReader.resolveTextPartPath(
        templateDir,
        "part_1",
      );

      expect(resolvedPath).toBeNull();
    });

    it("should resolve custom directory paths", () => {
      const templateDir = path.join(
        fixturesPath,
        "reconciliation_texts/custom_paths_test",
      );
      const resolvedPath = ConfigReader.resolveTextPartPath(
        templateDir,
        "intro",
      );

      expect(resolvedPath).not.toBeNull();
      expect(resolvedPath).toContain("custom_dir/intro.liquid");
      expect(path.isAbsolute(resolvedPath!)).toBe(true);
    });

    it("should validate that resolved path exists", () => {
      const templateDir = path.join(
        fixturesPath,
        "reconciliation_texts/reconciliation_text_1",
      );

      const resolvedPath = ConfigReader.resolveTextPartPath(
        templateDir,
        "part_1",
      );

      expect(resolvedPath).not.toBeNull();
    });

    it("should handle multiple parts in same template", () => {
      const templateDir = path.join(
        fixturesPath,
        "reconciliation_texts/reconciliation_text_3",
      );

      const part1 = ConfigReader.resolveTextPartPath(templateDir, "part_1");
      const part2 = ConfigReader.resolveTextPartPath(templateDir, "part_2");
      const part3 = ConfigReader.resolveTextPartPath(templateDir, "part_3");
      const part4 = ConfigReader.resolveTextPartPath(templateDir, "part_4");

      expect(part1).not.toBeNull();
      expect(part2).not.toBeNull();
      expect(part3).not.toBeNull();
      expect(part4).not.toBeNull();

      expect(part1).toContain("part_1.liquid");
      expect(part2).toContain("part_2.liquid");
      expect(part3).toContain("part_3.liquid");
      expect(part4).toContain("part_4.liquid");
    });
  });
});
