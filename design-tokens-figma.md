# Design tokens no Figma — uso no `figma_execute`

Este doc descreve como usar o mapeamento de tokens ([figma-token-map.json](./figma-token-map.json)) para criar componentes no Figma alinhados ao design system das [rules](./figma-desktop-brigde/.cursor/rules/project-overview.mdc).

## 1. O que o mapa contém

- **`figma-token-map.json`**: mapeia nomes de token (como nas rules) para `variableId` e nome da variável no Figma.
  - **colors**: `surface/default`, `surface/raised`, `text/primary`, `text/secondary`, `text/tertiary`, `border/subtle`, etc.
  - **dimensions**: `dimension-1` (4px) até `dimension-8` (32px), com `variableId` e `value`.
  - **radius**: `radius-200` (8), `radius-300` (12), `radius-400` (16).

Os IDs são do arquivo **TESTE TALK TO FIGMA** (`fileKey: l7VRuE2AQuGKTaqn7ZHwzW`). Se você trocar de arquivo ou as variáveis mudarem, reexporte com `figma_get_variables` e atualize o JSON.

---

## 2. Como usar no `figma_execute`

### 2.1 Resolver variableId dentro do plugin

Dentro do código que roda no Figma, **não** dá para ler o JSON do disco. Você tem duas opções:

**Opção A — Inline no código:** copiar o trecho necessário do mapa para dentro do script e usar por nome, por exemplo:

```javascript
const TOKENS = {
  surfaceDefault: "VariableID:13853:22282",
  surfaceRaised: "VariableID:13853:22259",
  textPrimary: "VariableID:13853:22387",
  textSecondary: "VariableID:13853:22375",
  textTertiary: "VariableID:13853:22245",
  borderSubtle: "VariableID:13853:22340",
  dimension4: "VariableID:9603:8490",
  dimension3: "VariableID:9603:8488",
  radius400: "VariableID:13853:22517",
  radius300: "VariableID:13853:22529",
  radius200: "VariableID:13853:22519"
};
```

**Opção B — Resolver por nome no documento:** usar `figma.variables` e o nome exato da variável (ex.: `color/light/color/surface/default`):

```javascript
function getVar(name) {
  const v = figma.variables.filter(x => x.name === name)[0];
  return v ? v.id : null;
}
const surfaceDefault = getVar('color/light/color/surface/default');
```

O [figma-token-map.json](./figma-token-map.json) fica como referência para **quais nomes** usar (campo `name` de cada token).

### 2.2 Vincular fill e stroke (setBoundVariable)

Quando a API do Figma permitir, use o `variableId` para não deixar hex:

- Fill: `node.setBoundVariable('fills', variableId)`
- Stroke: `node.setBoundVariable('strokes', variableId)`
- Corner radius: `node.setBoundVariable('cornerRadius', variableId)`
- Padding / itemSpacing: `node.setBoundVariable('paddingLeft', variableId)` (e idem para right, top, bottom, itemSpacing)

Se der erro (ex.: “not a function” ou não existir no seu Figma), crie com **valores numéricos** (usando o `value` do mapa quando existir) e depois rode **`run_recursive_token_fix`** na seleção para revincular a cores/dimensões do sistema.

### 2.3 Fonte: Roboto em todo o design system

O design system usa **apenas Roboto** (conforme as rules — Typography.fontFamily.roboto). Carregue os estilos necessários antes de criar textos:

- `await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' })`
- `await figma.loadFontAsync({ family: 'Roboto', style: 'Bold' })`
- `await figma.loadFontAsync({ family: 'Roboto', style: 'Medium' })` (se usar)
- `await figma.loadFontAsync({ family: 'Roboto', style: 'Semi Bold' })` (se usar)

Não usar fallback para Inter ou outras fontes; manter tudo em Roboto.

---

## 3. Exemplo: componente “Resumo do seu Pedido”

### Tokens a usar (referência no mapa)

| Uso no componente | Token (rules) | Nome no Figma / variableId no mapa |
|-------------------|----------------|-------------------------------------|
| Fundo do card | surface/default | `color/light/color/surface/default` |
| Borda do card | border/subtle | `color/light/color/border/subtle` |
| Padding e gap do card | dimension-4 (16) | `dimension/dimension-4` |
| Radius do card | radius-400 (16) | `border radius/radius-400` |
| Título e valores principais | text/primary | `color/light/color/text/primary` |
| “Editar”, “2 Gift Cards” | text/secondary | `color/light/color/text/secondary` |
| Fundo do bloco de resumo e logo | surface/raised | `color/light/color/surface/raised` |
| Taxa de serviço (secundário) | text/tertiary | `color/light/color/text/tertiary` |
| Padding/gap do bloco de resumo | dimension-3 (12) | `dimension/dimension-3` |
| Radius do bloco de resumo | radius-300 (12) | `border radius/radius-300` |
| Radius do logo | radius-200 (8) | `border radius/radius-200` |

### Fluxo recomendado no `figma_execute`

1. Carregar fontes Roboto (Regular, Bold, e outros estilos usados no componente).
2. Resolver `variableId` por nome com `figma.variables` (usando os nomes do [figma-token-map.json](./figma-token-map.json)).
3. Criar a árvore: Frame raiz → HeaderRow, ProductRow, SummaryBlock (todos com Auto Layout).
4. Aplicar fills/strokes/radius/padding:
   - Se `setBoundVariable` existir e funcionar: usar os `variableId` resolvidos.
   - Senão: usar valores numéricos do mapa (ex.: 16 para dimension-4, 12 para radius-300) e depois rodar **`run_recursive_token_fix`** na seleção.
5. Inserir o frame na página e chamar `figma.viewport.scrollAndZoomIntoView([root])`.

### Valores numéricos de fallback (quando não der para vincular)

Use estes quando criar sem binding, para ficar alinhado ao DS:

- **Cores (hex):** surface default `#FCFCFD`, surface raised `#F2F3F5`, text primary `#1C2024`, text secondary `#8B8F96`, text tertiary `#A8A8A8`, border subtle `#F2F3F5`.
- **Dimensões:** padding/gap 16 → 16, 12 → 12, 8 → 8.
- **Radius:** card 16, bloco resumo 12, logo 8.

---

## 4. Atualizar o mapa

Se você adicionar variáveis no Figma ou trocar de arquivo:

1. Chamar `figma_get_variables` (format filtered, collections/namePattern conforme necessário).
2. Atualizar [figma-token-map.json](./figma-token-map.json) com os novos `id` e `name`.
3. Opcional: manter um script que exporta o resultado de `figma_get_variables` para esse JSON.

Assim o `figma_execute` e as rules continuam alinhados ao design system real do arquivo.

---

## 5. Referências

- **Rules (design system):** [figma-desktop-brigde/.cursor/rules/project-overview.mdc](./figma-desktop-brigde/.cursor/rules/project-overview.mdc) — tokens de dimensão, tipografia, cor, nomenclatura, Auto Layout.
- **Comandos Figma (MCP):** [COMMANDS.md](./COMMANDS.md) — criação, modificação, texto, tokens (`run_recursive_token_fix`, `set_fill_variable`, etc.).
- **Integração tokens (Bridge):** [figma-desktop-brigde/MCP-INTEGRATION.md](./figma-desktop-brigde/MCP-INTEGRATION.md).
