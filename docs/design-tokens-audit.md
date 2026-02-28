# Auditoria dos design tokens

Verificação dos tokens em relação às [rules do projeto](../figma-desktop-brigde/.cursor/rules/project-overview.mdc) e ao uso no Figma.

**Tokens corrigidos e persistidos em:** [tokens/](../tokens/) — `primitives.json`, `semantic.json`, `composite.json`, `typography.json`. Ver [tokens/README.md](../tokens/README.md).

---

## O que está correto

### 1. Dimension (primitivos)
- Escala alinhada às rules: dimension-1 (4) até dimension-10 (64), dimension-9 (40), dimension-24 (240), dimension-999.
- `$type: "number"` e `$value` numérico estão corretos.

### 2. Estrutura semântica de cor (Semantic / Semantico)
- **Light:** `color.light.color.*` com `background`, `text`, `border`, `action`, `icon`, `overlay`, `surface` — bate com as rules (surface.*, text.*, border.*, etc.).
- **Dark:** `color.dark.color.*` com a mesma árvore — correto.
- Valores em hex e descrições estão consistentes (ex.: surface.default #fcfcfd, text.primary #1c2024).

### 3. Border radius, spacing, border width (composite)
- **border radius:** radius-0 a radius-full referenciando `{dimension.dimension-*}` — correto (radius-200 = 8, radius-400 = 16, etc.).
- **spacing:** none, xxs, xs … 7xl referenciando dimension — correto.
- **border width:** none, thin, default, thick referenciando dimension — correto.

### 4. Size (composite) e typography
- **Size composite:** size-xs = dimension-3 (12), size-md = dimension-5 (20), size-8xl = dimension-12 (96), etc. — escala coerente para tipografia.
- **Typography composite:** Display, Headline, Title, Body, Label, Caption usando `fontFamily: "Roboto"`, `fontWeight`, `fontSize: "{size.size-*}"`, `lineHeight: "{size.size-*}"` — alinhado às rules (Roboto, pesos regular/medium/semibold/bold, tamanhos xs→8xl).

### 5. Primitivos de tipografia
- `Typography.fontFamily.roboto` = "Roboto", `fontWeight` 400/500/600/700, `fontSize` (2-5, xs…8xl), `lineHeight` (xs…9xl), `letterSpacing` (tightest…normal) — corretos.

---

## Ajustes recomendados

### 1. Nome do bloco semântico
- Você usou **"Semantico"**; o padrão em design tokens é **"Semantic"** (em inglês). Sugestão: renomear para `Semantic` para evitar confusão e manter consistência com `color.light` / `color.dark`.

### 2. Token `Show` (boolean)
- Está assim: `"$type": "boolean", "$value": "true"`.
- `$value` deveria ser booleano, não string: `"$value": true`.
- Assim ferramentas e código que consomem o token tratam como boolean de fato.

### 3. Duas definições de `size` (primitivo vs composite)
- **Primeiro JSON (primitivos):** `size.size-xs` = 12, `size.size-md` = 16, `size.size-8xl` = 57, `size.size-9xl` = 64 (escala própria).
- **Terceiro JSON (composite):** `size.size-xs` = `{dimension.dimension-3}` (12), `size.size-8xl` = `{dimension.dimension-12}` (96), `size.size-9xl` = `{dimension.dimension-13}` (108).
- Ou seja: há duas escalas de “size” com nomes iguais e valores diferentes (ex.: size-8xl = 57 vs 96).
- **Sugestão:**  
  - Se a escala do **primeiro** bloco for para outro uso (ex.: ícones/avatares em px), renomear para evitar colisão, por exemplo: `iconSize` ou `sizePrimitive`.  
  - Se a escala “oficial” for a que referencia **dimension** (terceiro bloco), usar só essa para typography/layout e tratar o primeiro bloco como legado ou renomear.

### 4. Letter-spacing na Typography composite
- Nos compostos você usa strings como `"-2%"`, `"-1%"`, `"0%"`.
- Nos primitivos, `letterSpacing` é número: tightest = -2, tighter = -1, tight = -0.5, normal = 0.
- Para manter single source of truth, a Typography composite poderia referenciar os primitivos (ex.: um token `letterSpacing.tightest` com valor -2 ou -0.02 se for ratio). Se a ferramenta (ex.: Figma) exigir porcentagem, pode haver uma camada de export que converte. O importante é não duplicar a escala em dois formatos sem ligação.

### 5. Referência em Caption "2 Strong" e "2 Normal"
- Usam `"fontSize": "{Typography.fontSize.2-5}"` (valor 10 no primitivo).
- Está correto; só garantir que o consumidor resolva `Typography.fontSize.2-5` antes de `size.size-xs` se houver ordem de resolução de referências.

---

## Resumo

| Item | Status |
|------|--------|
| dimension (primitivos) | OK |
| color primitives (neutral, gray, brand, etc.) | OK |
| Semantic light/dark (estrutura e valores) | OK — aplicado: bloco renomeado para `Semantic` em `tokens/semantic.json` |
| border radius / spacing / border width (composite) | OK — em `tokens/composite.json` |
| Typography composite (Display, Headline, Title, Body, Label, Caption) | OK — em `tokens/typography.json` |
| Show ($value boolean) | Corrigido: `$value`: true em `tokens/primitives.json` |
| Duas escalas "size" | Corrigido: escala numérica primitiva renomeada para `iconSize` em primitives; `size` em composite é a oficial (dimension) |
| letterSpacing (primitivo vs composite) | Primitivos em primitives.json; composite usa "%" para Figma |

Tokens aplicados na pasta [tokens/](../tokens/).
