# Integração MCP – Tools adicionais

O plugin **Figma Desktop Bridge** expõe comandos que foram integrados ao servidor MCP **figma-console-mcp** para uso direto pelo Cursor.

**Referência completa de comandos do MCP:** [COMMANDS.md](../COMMANDS.md) (document and page, creation, modification, text, component tools).

## Novas tools

### Tokens / variáveis

1. **figma_get_nodes_with_unlinked_fills** – Lista nós com fill sem vínculo (variável ou estilo). Parâmetro opcional: `nodeId` (raiz da varredura; omitir = página atual).

2. **figma_audit_and_link_unlinked_fills** – Varre fills sem vínculo e vincula à variável de cor com mesmo hex. Parâmetro opcional: `nodeId`.

3. **figma_set_fill_variable** – Vincula o fill de um nó a uma variável de cor. Parâmetros: `nodeId`, `variableId`.

### Vínculos quebrados (Selection colors com ?)

4. **figma_scan_broken_bindings** – Lista fills/strokes que apontam para uma variável que não existe mais (ex.: "Selection colors" com ícone ?). Parâmetro opcional: `nodeId`.

5. **figma_repair_broken_bindings** – Substitui vínculos quebrados por cor sólida (padrão cinza #6B7280) para remover o (?). Parâmetros opcionais: `nodeId`, `fallbackHex`.

### Revincular por mapa de tokens (semântico + primitive)

6. **RUN_RECURSIVE_TOKEN_FIX** – Correção recursiva **sem colar JSON**: usa mapa padrão (FCFCFD→background, FFFFFF→icon, 1C2024→text.primary, etc.). Parâmetro opcional: `nodeId`. Se omitido, usa a **seleção atual** ou a página. Corrige no subtree: tokens quebrados, cores hardcoded e overrides de estilo (fillStyleId/strokeStyleId). **Recomendado para “corrigir tokens na seleção”.**

7. **REPAIR_AND_RELINK_BY_TOKEN_MAP** – Correção **recursiva** no escopo: re-vincula fills/strokes (quebrados ou hardcoded) usando mapa de tokens. Percorre **todo o subtree** (texto, ícones, bordas, estados, variantes). Para cada cor (hex), o mapa indica o path do token; o plugin escolhe token por role (text → text.*, stroke → border.*). Também corrige (c) cores hardcoded (hex sem variável). Ao aplicar variável, remove fillStyleId/strokeStyleId para o token prevalecer. Parâmetros: `semanticMap`, `primitiveMap`, `scope`: `{ type: 'document'|'page'|'node', nodeId?: string, pageId?: string }`. Resultado inclui `linked`, `noMatch`, `brokenFound`, `unlinkedFound`, `totalFixed`.

As mudanças foram feitas no pacote **figma-console-mcp** (usado pelo Cursor via npx):

- **dist/core/websocket-connector.js** – Novos métodos: `getNodesWithUnlinkedFills`, `auditAndLinkUnlinkedFills`, `setNodeFillVariable`.
- **dist/cloudflare/core/websocket-connector.js** – Mesmos métodos (modo cloudflare).
- **dist/local.js** – Registro das 3 novas tools.

Caminho típico do pacote (cache npx):

`~/.npm/_npx/<hash>/node_modules/figma-console-mcp/`

## Por que o número de tools pode cair (61 → 56)

**Em uma frase:** O pacote oficial do figma-console tem 56 tools; as outras ~5 (tokens, `run_recursive_token_fix`, etc.) foram adicionadas **editando o pacote dentro do cache do npx**. Quando esse cache é limpo ou o pacote é atualizado, essas edições somem e você volta a ver só 56.

---

O **figma-console-mcp** original (pacote npm/npx) expõe cerca de **56 tools**. As **~5 tools extras** (tokens, bindings, `run_recursive_token_fix`, etc.) foram adicionadas **por cima** do pacote, editando os arquivos no cache do npx:

- `dist/core/websocket-connector.js` (e cloudflare)
- `dist/local.js` (registro das tools)

Se o Cursor passou a mostrar **56 tools em vez de 61**, as alterações foram perdidas. Causas comuns:

1. **Cache do npx limpo** — `npx clear-npx-cache` ou reinstalação do pacote.
2. **Atualização do figma-console-mcp** — uma nova versão do pacote sobrescreveu o cache e as edits sumiram.
3. **MCP reinstalado/reconfigurado** — Cursor passou a usar outra instalação do figma-console sem o patch.

**Como recuperar as 61 tools:**

- **Se você tiver um patch:** rodar `npx patch-package figma-console-mcp` (com `patch-package` e o patch em `patches/`) para reaplicar.
- **Se não tiver patch:** reaplicar manualmente as alterações nos arquivos do pacote no cache npx reaplicar manualmente as alterações nos arquivos do pacote no cache npx (`~/.npm/_npx/<hash>/node_modules/figma-console-mcp/`), conforme a seção “Persistência” abaixo, e depois gerar o patch com `npx patch-package figma-console-mcp` para não perder de novo.

---

## Persistência

O código do MCP está em **node_modules** (cache do npx). Se você rodar `npx clear-npx-cache` ou reinstalar o pacote, as alterações podem ser perdidas.

Para manter as mudanças de forma estável:

1. Instalar **patch-package**: `npm install -D patch-package`
2. No `package.json`, em `"scripts"`, adicionar: `"postinstall": "patch-package"`
3. Copiar o pacote para dentro do projeto (por exemplo em `packages/figma-console-mcp`) ou aplicar o patch no cache do npx e gerar o patch: `npx patch-package figma-console-mcp`

Ou reaplicar manualmente os mesmos edits nos arquivos acima quando necessário.

## Como usar no Cursor

1. Reinicie o MCP (reconectar ao Figma ou reiniciar o Cursor).
2. As tools extras (tokens, bindings, `run_recursive_token_fix`) passam a aparecer na lista — com o patch aplicado, o total pode chegar a ~61 tools.
3. Com o plugin Desktop Bridge aberto no Figma, você pode pedir ao Cursor para “listar fills sem vínculo”, “auditar e vincular tokens” ou “vincular o fill do nó X à variável Y”.
