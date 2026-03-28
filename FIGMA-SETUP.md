# Configurar o Figma para o MCP (Figma Console)

O projeto usa o MCP **figma-console** (figma-console-mcp), conectado ao plugin **Figma Desktop Bridge** no Figma.

## No Cursor

- O MCP **figma-console** deve apontar para o `local.js` do pacote no projeto (como em `~/.cursor/mcp.json`) e usar **obrigatoriamente**:
  - `FIGMA_WS_PORT=3920`
  - `FIGMA_WS_STRICT_PORT=1` — impede o fallback automático do figma-console-mcp para 3921+ quando 3920 está ocupada (evita MCP e plugin em portas diferentes).
- Se a 3920 estiver ocupada: `lsof -ti:3920 | xargs kill -9` e reinicie o MCP no Cursor (toggle em Settings → MCP).
- Não é preciso rodar servidor nem `join_channel` deste repositório.

## No Figma

1. Abra um documento no Figma.
2. **Plugins** → **Figma Desktop Bridge** (manifest em `figma-desktop-brigde/manifest.json`).
3. O plugin conecta ao MCP por WebSocket **apenas na porta 3920**.
4. Quando pedir para "corrigir os tokens nesse componente", o assistente chama **`run_recursive_token_fix`** (usa a seleção atual se não passar `nodeId`).

## Referência

- Comandos de tokens: [figma-desktop-brigde/MCP-INTEGRATION.md](figma-desktop-brigde/MCP-INTEGRATION.md)
- Lista geral de comandos: [COMMANDS.md](COMMANDS.md)
