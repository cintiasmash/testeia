# Diagnóstico e plano — componente 10922:76211 (Selection colors "?")

## 1. Regras atualizadas

- **`.cursor/rules/figma-tokens-only-when-asked.mdc`**  
  Incluída a seção **1.1**: o scan de tokens quebrados deve usar sempre **`node.boundVariables`** (fills, strokes, opacity), e não apenas `node.fills[].boundVariable`.

- **`.cursor/rules/fix-broken-tokens.mdc`**  
  Na receita **2 — Escanear bindings quebrados**, ficou explícito que o "?" vem de `node.boundVariables`, e que o scan (manual ou via tool) deve percorrer `node.boundVariables.fills`, `.strokes`, `.opacity` e avaliar cada variableId (local vs externo).

---

## 2. Scan via node.boundVariables — componente 10922:76211

### 2.0 Selection colors agrega todos os nós selecionados

- O painel **Selection colors** mostra tokens de **todos os nós** que estão na seleção atual.
- Com o **component set** 10922:76211 selecionado, a seleção inclui o nó raiz e **todos os descendentes** (variantes, frames, textos, etc.).
- Por isso o "?" pode vir de **qualquer nó** dentro dessa árvore, não só dos dois filhos imediatos (Viewport=Default e Viewport=Mobile). O scan e a correção devem considerar **toda a árvore** sob 10922:76211.
- Na screenshot aparecem **dois** tokens truncados com "?": `color/light/color/text/t...` e `color/light/color/text/p_` — ou seja, pode haver **mais de uma variável** problemática (ex.: text/tertiary e text/primary ou text/placeholder), cada uma em vários nós.

### 2.1 Onde está o "?"

- **Nó raiz:** 10922:76211 (`Shared/Organism/FlowValidationContent`, COMPONENT_SET).
- **Binding:** O "?" vem de **`node.boundVariables.fills`** (e possivelmente .strokes, .opacity), não de `node.fills[].boundVariable`.
- **Variáveis envolvidas (confirmadas até agora):** **VariableID:13853:22293**. Na UI aparecem também nomes truncados como `color/light/color/text/t...` e `color/light/color/text/p_` — o scan completo deve listar **todos** os variableIds não mapeados/local em **todos** os descendentes.
- **Nós afetados:** qualquer descendente de 10922:76211 que tenha `boundVariables.fills` (ou .strokes / .opacity) apontando para variável externa ou fora do `figma-token-map.json`. Exemplos identificados: 10922:76212 (Viewport=Default), 10941:40126 (Viewport=Mobile); o número total só é conhecido após scan completo na árvore inteira.

Em cada um desses nós:

- `node.fills` = `[{ type: "SOLID", color: { r: ~0.988, g: ~0.988, b: ~0.992 } }]` (fallback #fcfcfd)
- `node.boundVariables.fills` = `[{ type: "VARIABLE_ALIAS", id: "VariableID:13853:22293" }]`

### 2.2 VariableID:13853:22293 — local ou externa?

- **No arquivo:** A variável é referenciada no documento (por isso aparece no Selection colors, às vezes como "?").
- **No `figma-token-map.json`:** O id **13853:22293 não existe**. Os ids de cor mapeados são, por exemplo:
  - 13853:22282 (surface/default)
  - 13853:22259 (surface/raised)
  - 13853:22387 (text/primary)
  - 13853:22375, 13853:22245, 13853:22222, 13853:22340, 13853:22295
- **Conclusão:** 13853:22293 **não** é um token do mapa local do projeto. Pode ser:
  - variável de outra coleção do mesmo arquivo (ex.: TypoGraphyNew), ou
  - variável de biblioteca externa (link quebrado ou não resolvido).

Em ambos os casos, para alinhar ao design system do projeto, o correto é **substituir por um token do `figma-token-map.json`**.

### 2.3 Substituta local equivalente

- **Cor de fallback do fill:** ~#fcfcfd (r: 0.988, g: 0.988, b: 0.992).
- **Token no `figma-token-map.json`** com mesmo valor semântico (superfície clara):
  - **surface/default** → VariableID:13853:22282, nome `color/light/color/surface/default`.
- **Substituta a usar:** **surface/default** (13853:22282).

---

## 3. Plano de correção (não aplicado)

### 3.1 Escopo

- **Componente:** 10922:76211 (e **toda a árvore** sob esse nó — não apenas os dois filhos imediatos).
- **O que será alterado:** **Todo nó descendente** que tenha `node.boundVariables.fills` (ou .strokes / .opacity) com variableId que não esteja no `figma-token-map.json` ou que seja de biblioteca externa (ex.: 13853:22293 e quaisquer outros que apareçam no scan). Como o Selection colors agrega todos os nós selecionados, a correção deve cobrir todos os nós afetados na árvore para o "?" sumir por completo.

### 3.2 Passos

1. **Scan (boundVariables):**
   - Percorrer todos os descendentes de 10922:76211.
   - Para cada nó, ler `node.boundVariables.fills`, `node.boundVariables.strokes`, `node.boundVariables.opacity`.
   - Para cada variableId encontrado, opcionalmente: verificar se pertence a uma coleção local (`getLocalVariableCollectionsAsync`) e se está no `figma-token-map.json`. Marcar como “substituir” se for 13853:22293 ou se for externa/não mapeada.

2. **Substituição (apenas após seu “Sim”):**
   - Para cada nó com `boundVariables.fills` apontando para 13853:22293:
     - Obter variável local **13853:22282** (surface/default) via `figma.variables.getVariableById("13853:22282")`.
     - Construir um novo paint SOLID com a cor atual (fallback) e vincular à variável:  
       `figma.variables.setBoundVariableForPaint(paint, "color", variableLocal)`.
     - Atribuir o array de fills atualizado a `node.fills`.
     - Garantir que `node.boundVariables.fills` passe a refletir o novo binding (ou remover/atualizar conforme a API do Figma para que o painel Selection colors mostre a variável local e não "?").
   - Repetir lógica para `boundVariables.strokes` se houver variableId 13853:22293 (ou outra externa); nesse caso a substituta semântica pode ser `border/default` ou `border/subtle` conforme o contexto.

3. **Verificação pós-correção:**
   - Rodar de novo o scan por `node.boundVariables` no mesmo componente.
   - Confirmar que não resta referência a 13853:22293 e que o "?" sumiu no Selection colors.

### 3.3 Resumo

| Item | Valor |
|------|--------|
| Nó do componente | 10922:76211 (Shared/Organism/FlowValidationContent) |
| Origem do "?" | node.boundVariables.fills com VariableID:13853:22293 |
| Variável 13853:22293 no figma-token-map? | Não |
| Substituta local (por valor/cargo) | surface/default → VariableID:13853:22282 |
| Ação | Substituir binding 13853:22293 por 13853:22282 nos nós afetados (apenas após confirmação). |

Nenhuma alteração foi aplicada no arquivo Figma; este documento é apenas diagnóstico e plano para execução após sua confirmação.
