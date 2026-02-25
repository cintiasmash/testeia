/**
 * Auditoria e correção de tokens de cor sem vínculo (fills e strokes).
 * Conforme project-overview.mdc: §8–§10 — tudo deve usar tokens; nada de HEX manual.
 *
 * IMPORTANTE: Correção global (todo o documento) só deve ser aplicada quando o
 * usuário solicitar explicitamente. Não executar em lote global por padrão.
 *
 * Uso:
 * - run() ou run(figma.currentPage.id) → só a página atual
 * - run(null, { global: true }) → todo o documento (todas as páginas)
 * Via MCP (figma_execute): executar este script uma vez; em seguida
 *   figma.tokenAuditRun(null, { global: true }) para correção global.
 *
 * Variáveis usadas para correção:
 * - Fill ícone branco: color/light/color/icon/inverse (VariableID:13853:22293)
 * - Background neutro: color/light/color/background/neutral/base (VariableID:13853:22336)
 * - Border default: color/light/color/border/default (VariableID:13853:22222)
 */
(function() {
  var ICON_INVERSE_VAR = 'VariableID:13853:22293';
  var BG_NEUTRAL_BASE_VAR = 'VariableID:13853:22336';
  var BORDER_DEFAULT_VAR = 'VariableID:13853:22222';

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function(x) {
      var h = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16);
      return h.length === 1 ? '0' + h : h;
    }).join('');
  }

  async function runSingleRoot(root) {
    var unlinkedFills = [];
    var unlinkedStrokes = [];

    function walk(n) {
      if (!n) return;
      if ('fills' in n && n.fills && n.fills.length) {
        var first = n.fills[0];
        var hasStyle = 'fillStyleId' in n && n.fillStyleId && String(n.fillStyleId).length > 0;
        var hasVar = first && first.boundVariables && first.boundVariables.color;
        if (!hasStyle && !hasVar && first.type === 'SOLID' && first.color) {
          var c = first.color, op = first.opacity != null ? first.opacity : 1;
          unlinkedFills.push({ nodeId: n.id, name: n.name, fillHex: rgbToHex(c.r, c.g, c.b), opacity: op });
        }
      }
      if ('strokes' in n && n.strokes && n.strokes.length) {
        var s = n.strokes[0];
        var hasStrokeStyle = 'strokeStyleId' in n && n.strokeStyleId && String(n.strokeStyleId).length > 0;
        var hasStrokeVar = s && s.boundVariables && s.boundVariables.color;
        if (!hasStrokeStyle && !hasStrokeVar && s.type === 'SOLID' && s.color) {
          var c = s.color, op = s.opacity != null ? s.opacity : 1;
          unlinkedStrokes.push({ nodeId: n.id, name: n.name, strokeHex: rgbToHex(c.r, c.g, c.b), opacity: op });
        }
      }
      if (n.children) for (var i = 0; i < n.children.length; i++) walk(n.children[i]);
    }
    walk(root);

    var fixed = [];
    for (var i = 0; i < unlinkedFills.length; i++) {
      var u = unlinkedFills[i];
      var node = await figma.getNodeByIdAsync(u.nodeId);
      if (!node || !node.fills || node.fills.length === 0) continue;
      var hex = (u.fillHex || '').replace('#', '').toUpperCase();
      var variable = null;
      if (hex === 'FFFFFF' || hex === 'FCFCFD') variable = await figma.variables.getVariableByIdAsync(ICON_INVERSE_VAR);
      else variable = await figma.variables.getVariableByIdAsync(BG_NEUTRAL_BASE_VAR);
      if (variable && variable.resolvedType === 'COLOR') {
        var fillsCopy = JSON.parse(JSON.stringify(node.fills));
        if (fillsCopy[0].type === 'SOLID') {
          fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', variable);
          node.fills = fillsCopy;
          fixed.push({ nodeId: u.nodeId, name: u.name, kind: 'fill', variable: variable.name });
        }
      }
    }
    for (var j = 0; j < unlinkedStrokes.length; j++) {
      var u2 = unlinkedStrokes[j];
      var node2 = await figma.getNodeByIdAsync(u2.nodeId);
      if (!node2 || !node2.strokes || node2.strokes.length === 0) continue;
      var variable2 = await figma.variables.getVariableByIdAsync(BORDER_DEFAULT_VAR);
      if (variable2 && variable2.resolvedType === 'COLOR') {
        var strokesCopy = JSON.parse(JSON.stringify(node2.strokes));
        if (strokesCopy[0].type === 'SOLID') {
          strokesCopy[0] = figma.variables.setBoundVariableForPaint(strokesCopy[0], 'color', variable2);
          node2.strokes = strokesCopy;
          fixed.push({ nodeId: u2.nodeId, name: u2.name, kind: 'stroke', variable: variable2.name });
        }
      }
    }

    return {
      unlinkedFills: unlinkedFills.length,
      unlinkedStrokes: unlinkedStrokes.length,
      fixed: fixed.length,
      details: fixed
    };
  }

  async function run(rootId, opts) {
    var globalMode = opts && opts.global === true;
    if (globalMode) {
      var pages = figma.root.children;
      var total = { unlinkedFills: 0, unlinkedStrokes: 0, fixed: 0, details: [], byPage: [] };
      for (var p = 0; p < pages.length; p++) {
        var page = pages[p];
        var res = await runSingleRoot(page);
        total.unlinkedFills += res.unlinkedFills;
        total.unlinkedStrokes += res.unlinkedStrokes;
        total.fixed += res.fixed;
        if (res.details && res.details.length) total.details = total.details.concat(res.details);
        total.byPage.push({ name: page.name, fixed: res.fixed, fills: res.unlinkedFills, strokes: res.unlinkedStrokes });
      }
      return total;
    }
    var root = await figma.getNodeByIdAsync(rootId || figma.currentPage.id);
    if (!root) return { error: 'Node or page not found' };
    return runSingleRoot(root);
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { run: run };
  else if (typeof figma !== 'undefined') {
    figma.tokenAuditRun = run;
    figma.ui.postMessage({ type: 'AUDIT_RESULT', result: run() });
  }
})();
