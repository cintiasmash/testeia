/**
 * Corrige tokens de cor quebrados ou desvinculados no componente.
 * Alinhado à regra .cursor/rules/fix-broken-tokens.mdc e ao figma-token-map.json (raiz do projeto).
 * Mapa canônico: hex → alias (surface/default, text/primary, border/default, etc.) → variableId.
 * Uso: executar via MCP figma_execute com este código (injetar nodeId se necessário), ou colar no plugin.
 * Node alvo padrão: 1058:20863 (ou altere nodeId abaixo).
 */
(async () => {
  const nodeId = "1058:20863";
  const variableIds = {
    "surface/default": "13853:22282",
    "surface/raised": "13853:22259",
    "text/primary": "13853:22387",
    "text/secondary": "13853:22375",
    "text/tertiary": "13853:22245",
    "border/default": "13853:22222",
    "border/subtle": "13853:22340",
    "icon/primary": "13853:22295"
  };
  const hexToToken = {
    "#fcfcfd": "surface/default", "#FCFCFD": "surface/default",
    "#1c2024": "text/primary", "#1C2024": "text/primary",
    "#ffffff": "surface/raised", "#FFFFFF": "surface/raised",
    "#8b8d98": "text/secondary", "#8B8D98": "text/secondary",
    "#a9a9a9": "text/tertiary", "#A9A9A9": "text/tertiary",
    "#d0d5dd": "border/default", "#D0D5DD": "border/default",
    "#f2f4f7": "border/subtle", "#F2F4F7": "border/subtle"
  };

  function toHex(c) {
    const r = Math.round((c.r || 0) * 255);
    const g = Math.round((c.g || 0) * 255);
    const b = Math.round((c.b || 0) * 255);
    const pad = (n) => n.toString(16).padStart(2, "0");
    return "#" + pad(r) + pad(g) + pad(b);
  }

  function normalizeHex(hex) {
    const h = hex.replace(/^#/, "").slice(0, 6);
    return "#" + h.toLowerCase();
  }

  function getTokenForHex(hex, isText) {
    const n = normalizeHex(hex);
    if (hexToToken[n]) return hexToToken[n];
    return isText ? "text/primary" : "surface/default";
  }

  let fixed = 0, skipped = 0;

  function walk(n) {
    if (!n || !n.visible) return;
    if ("fills" in n && n.fills !== figma.mixed && Array.isArray(n.fills)) {
      const fills = [...n.fills];
      let changed = false;
      for (let i = 0; i < fills.length; i++) {
        const p = fills[i];
        if (p.type !== "SOLID") continue;
        const bound = p.boundVariable;
        const hasBroken = bound && !figma.variables.getVariableById(bound.id);
        const hasSolid = !bound;
        if (hasBroken || hasSolid) {
          const hex = toHex(p.color);
          const token = getTokenForHex(hex, n.type === "TEXT");
          const varId = variableIds[token];
          const variable = varId ? figma.variables.getVariableById(varId) : null;
          if (variable) {
            fills[i] = figma.variables.setBoundVariableForPaint(p, "color", variable);
            changed = true;
            fixed++;
          } else skipped++;
        }
      }
      if (changed) n.fills = fills;
      if (n.type === "TEXT" && n.fillStyleId) n.fillStyleId = "";
    }
    if ("strokes" in n && n.strokes !== figma.mixed && Array.isArray(n.strokes)) {
      const strokes = [...n.strokes];
      let changed = false;
      for (let i = 0; i < strokes.length; i++) {
        const p = strokes[i];
        if (p.type !== "SOLID") continue;
        const bound = p.boundVariable;
        const hasBroken = bound && !figma.variables.getVariableById(bound.id);
        const hasSolid = !bound;
        if (hasBroken || hasSolid) {
          const hex = toHex(p.color);
          const token = getTokenForHex(hex, false);
          const t = token === "text/primary" || token === "text/secondary" ? "border/default" : token;
          const varId = variableIds[t] || variableIds["border/default"];
          const variable = varId ? figma.variables.getVariableById(varId) : null;
          if (variable) {
            strokes[i] = figma.variables.setBoundVariableForPaint(p, "color", variable);
            changed = true;
            fixed++;
          } else skipped++;
        }
      }
      if (changed) n.strokes = strokes;
      if (n.strokeStyleId) n.strokeStyleId = "";
    }
    if ("children" in n) for (const c of n.children) walk(c);
  }

  const root = figma.getNodeById(nodeId);
  if (!root) return { error: "Nó " + nodeId + " não encontrado. Abra o arquivo no Figma." };
  walk(root);
  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  return { ok: true, fixed, skipped, nodeId };
})();
