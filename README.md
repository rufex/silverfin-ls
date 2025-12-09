# Liquid Language Server

Language Server Protocol (LSP) implementation for Silverfin Liquid templates.

## Features

**Hover Information**

- Tag documentation (assign, capture, result, etc.)
- Translation keys and values (`{% t= %}`)

**Go to Definition**

- Navigate to shared parts and text parts
- Translations and variables

**Context-Aware**

- Identify template structure and relationships (parts and shared parts)
- Creates a map of relationships between main templates, text parts, and shared parts
- Tracks line ranges for accurate navigation
- Parses liquid using Tree-sitter

## Configuration

The language server supports the following configuration options:

### Hover Documentation

You can disable hover documentation by setting `hover.enabled` to `false`.

### Template Context Resolution

When working from shared parts, the language server needs to know which template context to use since shared parts can be included in multiple templates. Create a `liquid-ls.json` file in your workspace root:

```json
{
  "currentTemplate": {
    "type": "reconciliationText",
    "handle": "my_template_handle"
  }
}
```

Valid template types are: `"reconciliationText"`, `"accountTemplate"`, `"exportFile"`

**VS Code (settings.json):**

```json
{
  "liquidLS": {
    "hover": {
      "enabled": false
    },
    "logLevel": "debug"
  }
}
```

**Neovim:**

```lua
init_options = {
  hover = {
    enabled = false
  },
  logLevel = "debug"
}
```
