# Scripts

This directory contains debug scripts for analyzing and understanding the internal workings of the silverfin-ls language server.

## Available Scripts

### listAllTemplatePartsMaps.ts

**Purpose:** Lists the template parts map for templates. Can analyze all templates in a directory, or a specific template.

**What it shows:**

- The exact order in which template parts are executed
- How template are structured in multiple parts when they contain includes
- Line ranges for each part
- File type (main/text_part/shared_part)
- Which file is "current" when opening a template

**Usage:**

```bash
# Build first
npm run build

# Analyze all templates in fixtures/market-repo (default)
node out/scripts/listAllTemplatePartsMaps.js

# Analyze all templates in a specific directory
node out/scripts/listAllTemplatePartsMaps.js /path/to/templates/root

# Analyze a specific template
node out/scripts/listAllTemplatePartsMaps.js /path/to/template/main.liquid
```

--- definitions_and_references ---

Path: reconciliation_texts/definitions_and_references/main.liquid
Total parts: 1
Current part index when opening main.liquid: 0

Parts order:
Idx | File | Type | Lines | Current

---

    0 | main.liquid                   | main         |    0-155  | <--

--- include_parts_test ---

Path: reconciliation_texts/include_parts_test/main.liquid
Total parts: 12
Current part index when opening main.liquid: 0

Parts order:
Idx | File | Type | Lines | Current

---

    0 | main.liquid                   | main         |    0-4    | <--
    1 | included_1.liquid             | text_part    |    0-2    |
    2 | included_2.liquid             | text_part    |    0-0    |
    3 | included_1.liquid             | text_part    |    4-4    |
    4 | included_shared_2.liquid      | shared_part  |    0-0    |
    5 | included_1.liquid             | text_part    |    6-7    |
    6 | main.liquid                   | main         |    6-10   |
    7 | included_shared_1.liquid      | shared_part  |    0-0    |
    8 | included_shared_2.liquid      | shared_part  |    0-0    |
    9 | included_shared_1.liquid      | shared_part  |    2-3    |

10 | main.liquid | main | 12-12 |
11 | main.liquid | main | 14-14 |

```

```
