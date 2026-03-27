# figma_fix_unlinked_tokens

Quando este comando for usado, faça o seguinte:

1. **Obter o `nodeId`** a partir do que o usuário informou:
   - Se for um **node-id** já no formato do plugin (ex.: `123:456` ou `123-456`), normalize para o formato esperado pela ferramenta (geralmente `123:456` com dois-pontos).
   - Se for uma **URL do Figma**, extraia `node-id` da query string. O Figma codifica o id como `PAGE-NODE` (hífen no lugar de `:`). Ex.: `node-id=13853-22282` → `nodeId` = `13853:22282`.

2. **Chamar a ferramenta MCP** `figma_fix_unlinked_tokens` no servidor Figma (Desktop Bridge, **localhost:3920**), com o schema em `mcps/user-figma-console/tools/figma_fix_unlinked_tokens.json`, passando:
   ```json
   { "nodeId": "<nodeId resolvido>" }
   ```

3. **Mostrar o resultado completo** na resposta ao usuário: saída bruta da ferramenta (lista de nós corrigidos com `nodeId`, `nodeName`, `kind`, `tokenOld`, `tokenNew`, ou mensagens de erro). Não resuma de forma a omitir nós afetados ou falhas.

4. Se a chamada MCP falhar (ex.: conexão), tente diagnosticar conforme as regras do workspace para o plugin Figma na porta 3920 antes de afirmar que está desconectado.

**Substitua** `[URL OU NODE-ID]` pelo valor que o usuário colar ao invocar o comando.
