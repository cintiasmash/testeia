# Configurar o Figma para o MCP (Figma Console)

O projeto usa o MCP **figma-console** (figma-console-mcp), conectado ao plugin **Figma Desktop Bridge** no Figma.

## No Cursor

- O MCP **figma-console** deve estar configurado nas suas MCP settings (ex.: `user-figma-console`).
- Não é preciso rodar servidor nem `join_channel` deste repositório.

## No Figma

1. Abra um documento no Figma.
2. **Plugins** → **Figma Desktop Bridge** (ou o nome do plugin que você instalou).
3. O plugin conecta ao MCP por WebSocket (porta 3055 ou 9223–9232).
4. Quando pedir para "corrigir os tokens nesse componente", o assistente chama **`run_recursive_token_fix`** (usa a seleção atual se não passar `nodeId`).

## Referência

- Comandos de tokens: [figma-desktop-brigde/MCP-INTEGRATION.md](figma-desktop-brigde/MCP-INTEGRATION.md)
- Lista geral de comandos: [COMMANDS.md](COMMANDS.md)
