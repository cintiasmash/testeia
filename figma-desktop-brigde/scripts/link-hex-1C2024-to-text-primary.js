/**
 * Vincula em TODO o documento todos os fills com cor #1C2024
 * ao token color/light/color/text/primary.
 *
 * Como usar:
 * 1. No Figma: Plugins → Development → Figma Desktop Bridge (deixe aberto).
 * 2. No Cursor, peça ao agente para executar este script via figma_execute,
 *    ou copie o conteúdo de run() abaixo e cole no console do plugin (se disponível).
 *
 * Variável alvo: color/light/color/text/primary (VariableID:13853:22387)
 * Cor alvo: #1C2024
 */
(function() {
  var TARGET_HEX = '1C2024';
  var VARIABLE_ID = 'VariableID:13853:22387';

  function toHex(r, g, b) {
    return [r, g, b]
      .map(function(x) {
        var h = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16);
        return h.length === 1 ? '0' + h : h;
      })
      .join('')
      .toUpperCase();
  }

  async function run() {
    var variable = await figma.variables.getVariableByIdAsync(VARIABLE_ID);
    if (!variable || variable.resolvedType !== 'COLOR') {
      return { error: 'Variable color/light/color/text/primary not found' };
    }

    var linked = 0;
    var pages = figma.root.children;

    for (var p = 0; p < pages.length; p++) {
      var page = pages[p];
      var nodes = page.findAll(function(n) {
        if (!('fills' in n) || !n.fills || n.fills.length === 0) return false;
        var f = n.fills[0];
        return f.type === 'SOLID' && f.color;
      });

      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.fillStyleId && String(node.fillStyleId).length > 0) continue;
        var fill = node.fills[0];
        if (fill.boundVariables && fill.boundVariables.color) continue;
        if (toHex(fill.color.r, fill.color.g, fill.color.b) !== TARGET_HEX) continue;
        try {
          var copy = JSON.parse(JSON.stringify(node.fills));
          copy[0] = figma.variables.setBoundVariableForPaint(copy[0], 'color', variable);
          node.fills = copy;
          linked++;
        } catch (e) {}
      }
    }

    return { success: true, linked: linked, token: 'color/light/color/text/primary', targetHex: '#' + TARGET_HEX };
  }

  run().then(function(result) {
    console.log('Link #1C2024 → text/primary:', result);
  });
})();
