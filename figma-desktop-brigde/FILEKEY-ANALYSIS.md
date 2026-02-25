# Análise: por que o arquivo do Figma precisa estar salvo (fileKey)

## O que é o fileKey

- **`figma.fileKey`** é uma propriedade da API de plugins do Figma ([Plugin API](https://www.figma.com/plugin-docs/api/figma/#filekey)).
- É uma **string** que identifica o arquivo de forma única na nuvem do Figma (ex.: `"abc123XYZ"`).
- Só existe quando o arquivo **já foi salvo** no Figma (tem link próprio, ex. `https://www.figma.com/file/abc123XYZ/Nome-do-Arquivo`).
- Em arquivos **não salvos** (Untitled / sem link), `figma.fileKey` é **`null`**.

## Por que a ponte exige fileKey

1. **Identificação no Cursor (MCP)**  
   O servidor MCP do Figma associa cada conexão WebSocket a um **arquivo** via `FILE_INFO` com `fileKey`. Sem ele, o Cursor não sabe qual arquivo está “conectado” e não pode rotear comandos nem mostrar o contexto certo.

2. **Fluxo na ponte**  
   Ao clicar em “Conectar ao Cursor”:
   - O plugin envia **GET_FILE_INFO** ao worker (code.js).
   - O worker responde com **fileInfo**: `{ fileName, fileKey, currentPage }`.
   - Se `fileKey` existir, a UI envia **FILE_INFO** pelo WebSocket para o MCP.
   - O MCP registra a conexão com aquele `fileKey` e passa a aceitar comandos para esse arquivo.

3. **O que acontece se o arquivo não estiver salvo**  
   - `figma.fileKey` é `null`.
   - A ponte **não envia** `FILE_INFO` (ou envia com `fileKey: null`).
   - O MCP não registra a conexão como “arquivo conectado”.
   - Por isso a ponte **bloqueia** e mostra erro: *“Arquivo sem fileKey. Salve o arquivo no Figma (File → Save ou Cmd+S) e clique em Conectar de novo.”*

## Onde isso aparece no código

| Onde            | O que faz |
|-----------------|-----------|
| **code.js**     | Em `GET_FILE_INFO`, envia `fileInfo: { fileName: figma.root.name, fileKey: figma.fileKey \|\| null, currentPage: figma.currentPage.name }`. |
| **ui.html**     | Ao conectar: chama `GET_FILE_INFO`; se `!info.fileInfo.fileKey` → mostra o erro e não envia `FILE_INFO` nem marca “Conectado”. |
| **Pré-checagem** | No clique em “Conectar”, a UI primeiro chama `GET_FILE_INFO`; se não houver `fileKey`, mostra o erro e **nem abre** o WebSocket. |

## Melhorias feitas (pré-checagem)

- **Antes:** Abria o WebSocket, mostrava “Enviando fileKey…”, e só então descobria que `fileKey` era null e mostrava erro.
- **Agora:** Ao clicar em “Conectar”, a UI mostra “Verificando arquivo…” e chama `GET_FILE_INFO`. Se o arquivo não estiver salvo (`fileKey` null), mostra o erro **antes** de tentar qualquer porta WebSocket, deixando claro que o problema é a falta de save.

## Resumo para o usuário

**Ponto 3 (salvar o arquivo):**  
O arquivo precisa estar **salvo** no Figma para ter um **fileKey**. Sem fileKey, a ponte não consegue identificar o arquivo no Cursor e não completa a conexão. Salve com **File → Save** (ou Cmd+S), depois clique em “Conectar ao Cursor” de novo.
