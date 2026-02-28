# Design tokens

Tokens do design system, alinhados às [rules do projeto](../figma-desktop-brigde/.cursor/rules/project-overview.mdc). Formato W3C Design Tokens (DTCG) com `$type` e `$value`.

## Estrutura

| Arquivo | Conteúdo |
|---------|----------|
| **primitives.json** | `dimension`, `iconSize` (ícones/avatares), `color` (primitivos), `Typography` (fontFamily, fontWeight, fontSize, lineHeight, letterSpacing), `Show` |
| **semantic.json** | `Semantic.color.light` e `Semantic.color.dark` — cores semânticas (background, text, border, action, icon, overlay, surface) |
| **composite.json** | `size` (de dimension), `border radius`, `spacing`, `border width` — referenciam `{dimension.dimension-*}` |
| **typography.json** | `Typography` composite — Display, Headline, Title, Body, Label, Caption (referenciam `{size.size-*}`) |

## Correções aplicadas (auditoria)

- **Semantico → Semantic:** bloco semântico renomeado para `Semantic`.
- **Show:** `$value` é boolean `true`, não string `"true"`.
- **size:** escala numérica primitiva renomeada para **iconSize** (uso em ícones/avatares); **size** em `composite.json` é a escala oficial (derivada de dimension) para tipografia e layout.

## Uso

- **Figma:** use [figma-token-map.json](../figma-token-map.json) para mapear tokens aos `variableId` do arquivo; ver [design-tokens-figma.md](../design-tokens-figma.md).
- **Código/CSS:** resolva referências `{dimension.dimension-4}` etc. a partir de `primitives.json` e `composite.json`; use `Semantic.color.light` / `Semantic.color.dark` para temas.

## Ordem de resolução

1. Primitivos (dimension, color primitives, Typography primitives).
2. Composite (size, border radius, spacing, border width).
3. Semantic (cores light/dark).
4. Typography composite (referencia size e Typography.fontSize.2-5).
