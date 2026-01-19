# String Category

> Text manipulation and formatting nodes in LATCH.

**Category Color:** Emerald (`#10B981`)
**Icon:** `type`

---

## String Concat

Concatenate multiple strings.

| Property | Value |
|----------|-------|
| **ID** | `string-concat` |
| **Icon** | `plus` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `string` | First string |
| `b` | `string` | Second string |
| `c` | `string` | Third string |
| `d` | `string` | Fourth string |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `string` | Combined string |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `separator` | `text` | `''` | Separator between strings |

### Implementation
Joins all non-empty input strings with the specified separator. Empty inputs are skipped.

---

## String Split

Split string into parts.

| Property | Value |
|----------|-------|
| **ID** | `string-split` |
| **Icon** | `scissors` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `input` | `string` | String to split |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `parts` | `array` | Array of string parts |
| `first` | `string` | First part |
| `count` | `number` | Number of parts |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `separator` | `text` | `,` | - | Split delimiter |
| `limit` | `number` | `0` | min: 0 | Max parts (0 = unlimited) |

### Implementation
Uses `String.split()` with optional limit. Useful for parsing CSV data or extracting parts from structured strings.

---

## String Replace

Replace text in a string.

| Property | Value |
|----------|-------|
| **ID** | `string-replace` |
| **Icon** | `replace` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `input` | `string` | Source string |
| `search` | `string` | Text to find |
| `replace` | `string` | Replacement text |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `string` | Modified string |
| `_error` | `string` | Regex error (if any) |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `search` | `text` | `''` | Search pattern |
| `replace` | `text` | `''` | Replacement text |
| `useRegex` | `toggle` | `false` | Treat search as regex |
| `replaceAll` | `toggle` | `true` | Replace all occurrences |

### Implementation
Uses `String.replace()` or `String.replaceAll()`. When regex mode enabled, creates RegExp from search pattern with appropriate flags.

---

## String Slice

Extract a portion of a string.

| Property | Value |
|----------|-------|
| **ID** | `string-slice` |
| **Icon** | `slice` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `input` | `string` | Source string |
| `start` | `number` | Start index |
| `end` | `number` | End index |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `string` | Extracted substring |
| `length` | `number` | Result length |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `start` | `number` | `0` | Start index (0-based) |
| `end` | `number` | `-1` | End index (-1 = end of string) |

### Implementation
Uses `String.slice()`. Negative indices count from end of string. End index is exclusive.

---

## String Case

Convert string case.

| Property | Value |
|----------|-------|
| **ID** | `string-case` |
| **Icon** | `case-upper` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `input` | `string` | Source string |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `string` | Converted string |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `mode` | `select` | `UPPER` | options: UPPER, lower, Title, camelCase, snake_case, kebab-case | Case conversion mode |

### Implementation
Converts string case:
- **UPPER**: All uppercase
- **lower**: All lowercase
- **Title**: First Letter Of Each Word Capitalized
- **camelCase**: firstWordLowerRestCapitalized
- **snake_case**: words_separated_by_underscores
- **kebab-case**: words-separated-by-hyphens
