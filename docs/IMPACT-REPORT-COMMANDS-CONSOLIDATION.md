# Relatório de Impacto — Consolidação da Referência de Comandos Figma MCP

**Data:** 24/02/2025  
**Objetivo:** Implementar a referência "Available commands" como fonte única e consolidar componentes/trechos duplicados no projeto.

---

## 1. Escopo do que será alterado/criado

### 1.1 Criar (novos artefatos)

| Item | Descrição |
|------|-----------|
| **`COMMANDS.md`** (raiz do projeto) | Documento único de referência dos comandos do Figma MCP: tabelas por categoria (Document and page tools, Creation tools, Modification tools, Text tools, Component tools), exemplos de uso e dicas. Conteúdo alinhado ao bloco "Available commands" que você forneceu. |
| **`INSTALLATION.md`** (opcional) | Stub que redireciona para `FIGMA-SETUP.md` (instalação do plugin e do socket), para manter os links do header da referência. |
| **`docs/`** | Pasta para documentação (este relatório e, se aprovado, referência cruzada). |

### 1.2 Alterar (arquivos existentes)

| Arquivo | Alteração |
|---------|-----------|
| **`FIGMA-SETUP.md`** | Inserir link para `COMMANDS.md` na seção "No Cursor", substituindo a lista inline de ferramentas (`get_document_info`, `get_selection`, etc.) por referência à referência completa. |
| **`figma-desktop-brigde/MCP-INTEGRATION.md`** | Adicionar no início referência a `COMMANDS.md` como documentação principal de comandos; manter a lista de tools extras (tokens, bindings, relink) como "Tools adicionais / Token & Bindings" para não duplicar a tabela principal. |
| **`figma-desktop-brigde/.cursor/rules/project-overview.mdc`** | Na parte de tokens quebrados (comandos SCAN_BROKEN_BINDINGS, REPAIR_*, REPAIR_AND_RELINK), adicionar uma linha referenciando a documentação de comandos (COMMANDS.md ou MCP-INTEGRATION.md) onde aplicável, sem remover as instruções de fluxo. |

### 1.3 Não alterar (evitar breaking changes)

| Item | Motivo |
|------|--------|
| **`src/talk_to_figma_mcp/server.ts`** | As descrições das tools são usadas pelo MCP para descoberta; alterá-las pode mudar o comportamento de agentes que dependem delas. Apenas adicionar um comentário no topo do bloco de tools apontando `COMMANDS.md` como referência de documentação. |
| **Plugin `figma-desktop-brigde/code.js`** | Sem mudança; a consolidação é apenas de documentação e referências. |
| **Socket server, `package.json`, tsconfig** | Sem mudança. |

---

## 2. Itens duplicados/similares identificados e estratégia de consolidação

### 2.1 Duplicações identificadas

| Local 1 | Local 2 | Tipo |
|---------|---------|------|
| Lista de ferramentas no **FIGMA-SETUP.md** (get_document_info, get_selection, join_channel, “etc.”) | Tabela “Available commands” (a ser **COMMANDS.md**) | Lista parcial vs. referência completa |
| **MCP-INTEGRATION.md**: lista de tools (figma_get_nodes_with_unlinked_fills, figma_audit_*, etc.) | **server.ts**: tools `get_nodes_with_unlinked_fills`, `link_unlinked_fills_to_tokens`, etc. | Mesma funcionalidade com nomes ligeiramente diferentes (MCP-INTEGRATION usa prefixo `figma_` em alguns contextos) |
| **project-overview.mdc**: comandos de token (SCAN_BROKEN_BINDINGS, REPAIR_*, REPAIR_AND_RELINK_BY_TOKEN_MAP) | **MCP-INTEGRATION.md**: descrição das tools de bindings/relink | Fluxo detalhado vs. lista de tools |

### 2.2 Estratégia de consolidação

- **Fonte única para “Available commands” (tabela principal):**  
  Criar **`COMMANDS.md`** na raiz com exatamente as categorias e tabelas que você forneceu. Qualquer menção à “lista de comandos” ou “ferramentas do Figma” no projeto deve apontar para este arquivo.

- **FIGMA-SETUP.md:**  
  Remover a enumeração inline de ferramentas e substituir por: “As ferramentas do Figma (get_document_info, get_selection, join_channel, etc.) estão documentadas em [COMMANDS.md](COMMANDS.md).”

- **MCP-INTEGRATION.md:**  
  - Manter como doc de **integração** e **tools adicionais** (tokens, bindings, relink).  
  - No topo: “Para a referência completa de comandos do MCP, ver [COMMANDS.md](../COMMANDS.md).”  
  - Manter a lista de tools extras (figma_get_nodes_with_unlinked_fills, etc.) sem duplicar a tabela de COMMANDS.md.

- **project-overview.mdc:**  
  Manter o fluxo obrigatório e a tabela de escopo; apenas adicionar referência à documentação de comandos (COMMANDS.md ou MCP-INTEGRATION.md) onde fizer sentido (ex.: “Comandos disponíveis no MCP: ver COMMANDS.md”).

- **server.ts:**  
  Não alterar nomes nem assinaturas de tools. Adicionar comentário único no início do bloco de tools, por exemplo:  
  `// Tool reference: see COMMANDS.md in project root.`

Com isso, a **referência canônica** de comandos fica em um único lugar (**COMMANDS.md**), e os outros arquivos apenas referenciam ou complementam (tools extras / fluxos de token).

---

## 3. Riscos e possíveis pontos de quebra (UI, lógica, dependências)

### 3.1 Riscos baixos

| Risco | Mitigação |
|-------|-----------|
| Links quebrados (COMMANDS.md movido ou renomeado) | Manter COMMANDS.md na raiz; links relativos (../COMMANDS.md) apenas a partir de subpastas. |
| Dúvida sobre “qual doc ler” | Header de COMMANDS.md já indica: “Complete reference of the tools Claude can use”; FIGMA-SETUP e MCP-INTEGRATION referenciam COMMANDS.md explicitamente. |

### 3.2 Riscos a considerar (sem breaking change se não alterarmos código)

| Risco | Mitigação |
|-------|-----------|
| Comandos na tabela que não existem no `server.ts` | A tabela que você forneceu inclui, por exemplo: get_pages, create_page, delete_page, rename_page, set_current_page, create_ellipse, create_polygon, create_star, group_nodes, ungroup_nodes, insert_child, flatten_node, set_selection_colors, rename_node, set_auto_layout, set_effects, set_effect_style_id, set_text_align, set_font_name, set_font_size, set_font_weight, set_text_style_id, set_letter_spacing, set_line_height, set_paragraph_spacing, set_text_case, set_text_decoration, get_styled_text_segments, load_font_async, get_remote_components, set_instance_variant. No **server.ts** atual não há tools para todos esses. **Recomendação:** publicar COMMANDS.md como referência “completa” (incluindo comandos planejados ou do plugin) e, no final do doc, adicionar uma nota: “Alguns comandos da tabela podem estar disponíveis apenas no plugin ou em versões futuras; a lista exata de tools expostas pelo MCP está no servidor (server.ts).” Assim não quebramos expectativa de que exista 1:1 entre tabela e implementação. |
| Nomenclatura MCP vs. plugin | MCP-INTEGRATION usa prefixo `figma_` em alguns nomes; no server.ts as tools são, por exemplo, `get_nodes_with_unlinked_fills`. Manter os dois documentos: COMMANDS.md para a referência “Available commands”; MCP-INTEGRATION para as tools extras e nomes como usados na integração. Não alterar nomes de tools no server.ts. |

### 3.3 O que não será feito (para evitar quebra)

- Não alterar assinaturas, nomes ou parâmetros de nenhuma tool em `server.ts`.
- Não remover nem alterar fluxos em `project-overview.mdc` (apenas adicionar referência à doc de comandos).
- Não remover conteúdo de MCP-INTEGRATION.md; apenas adicionar link e evitar duplicar a tabela grande.

---

## 4. Plano de rollout (passos) e checklist de testes/regressão

### 4.1 Passos de rollout

1. **Criar `COMMANDS.md`** na raiz com o conteúdo da referência “Available commands” (tabelas, exemplos, dicas). Incluir no final a nota sobre comandos possivelmente não implementados no MCP (conforme seção 3.2).
2. **Criar `docs/`** e manter este relatório em `docs/IMPACT-REPORT-COMMANDS-CONSOLIDATION.md`.
3. **Atualizar `FIGMA-SETUP.md`**: adicionar link para COMMANDS.md e substituir a lista inline de ferramentas pela referência.
4. **Atualizar `figma-desktop-brigde/MCP-INTEGRATION.md`**: adicionar no início o link para COMMANDS.md; manter a seção de tools adicionais.
5. **Atualizar `figma-desktop-brigde/.cursor/rules/project-overview.mdc`**: adicionar uma linha de referência à documentação de comandos (COMMANDS.md ou MCP-INTEGRATION) na parte de tokens quebrados.
6. **Comentar em `src/talk_to_figma_mcp/server.ts`**: no início do bloco de definição de tools, adicionar comentário apontando para COMMANDS.md.
7. **(Opcional)** Criar `INSTALLATION.md` na raiz com uma linha do tipo “Ver [FIGMA-SETUP.md](FIGMA-SETUP.md) para instalação do plugin e do socket”, para que o link do header da referência não quebre.

### 4.2 Checklist de testes / regressão

- [ ] **Links:** Clicar em todos os links para COMMANDS.md e FIGMA-SETUP.md a partir de FIGMA-SETUP, MCP-INTEGRATION e project-overview; garantir que abrem o arquivo correto.
- [ ] **MCP:** Rodar `npm run build` e iniciar o MCP (ex.: `npm run start` ou fluxo usado no Cursor); verificar que a lista de tools não mudou (nomes e descrições).
- [ ] **Socket + plugin:** Manter o fluxo atual (socket + plugin no Figma + join_channel); executar uma ferramenta (ex.: get_document_info, get_selection) e confirmar que o comportamento é o mesmo.
- [ ] **Leitura por IA:** Se possível, abrir COMMANDS.md no Cursor e pedir “Listar os comandos de criação”; o modelo deve encontrar a tabela em COMMANDS.md como fonte única.
- [ ] **Regressão de conteúdo:** Comparar rapidamente que nenhum passo de FIGMA-SETUP ou de project-overview (tokens quebrados) foi removido ou alterado em lógica; apenas referências e links foram adicionados.

---

## 5. Resumo

- **Criar:** `COMMANDS.md` (fonte única da referência “Available commands”) e, opcionalmente, `INSTALLATION.md` e pasta `docs/`.
- **Consolidar:** FIGMA-SETUP, MCP-INTEGRATION e project-overview passam a referenciar COMMANDS.md em vez de duplicar a lista de comandos; server.ts ganha apenas um comentário de referência.
- **Riscos:** Baixos; a única ressalva é deixar explícito no COMMANDS.md que a tabela pode incluir comandos não expostos ainda pelo MCP.
- **Rollout:** 6–7 passos sequenciais; checklist de links, MCP, socket/plugin e regressão de conteúdo.

Após sua aprovação deste relatório, a implementação seguirá estes passos, garantindo **sem breaking changes**, **compatibilidade com fluxos existentes** e **validação** conforme o checklist acima.
