// Figma Desktop Bridge - MCP Plugin
// Bridges Figma API to MCP clients via plugin UI window
// Supports: Variables, Components, Styles, and more
// Uses postMessage to communicate with UI, bypassing worker sandbox limitations
// Puppeteer can access UI iframe's window context to retrieve data

console.log('🌉 [Desktop Bridge] Plugin loaded and ready');

// Show UI: connection, history, tokens (approval is handled in Cursor)
figma.showUI(__html__, { width: 280, height: 380, visible: true, themeColors: true });

// ============================================================================
// CONSOLE CAPTURE — Intercept console.* in the QuickJS sandbox and forward
// to ui.html via postMessage so the WebSocket bridge can relay them to the MCP
// server. This enables console monitoring without CDP.
// ============================================================================
(function() {
  var levels = ['log', 'info', 'warn', 'error', 'debug'];
  var originals = {};
  for (var i = 0; i < levels.length; i++) {
    originals[levels[i]] = console[levels[i]];
  }

  function safeSerialize(val) {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
    try {
      // Attempt JSON round-trip for objects/arrays (catches circular refs)
      return JSON.parse(JSON.stringify(val));
    } catch (e) {
      return String(val);
    }
  }

  for (var i = 0; i < levels.length; i++) {
    (function(level) {
      console[level] = function() {
        // Call the original so output still appears in Figma DevTools
        originals[level].apply(console, arguments);

        // Serialize arguments safely
        var args = [];
        for (var j = 0; j < arguments.length; j++) {
          args.push(safeSerialize(arguments[j]));
        }

        // Build message text from all arguments
        var messageParts = [];
        for (var j = 0; j < arguments.length; j++) {
          messageParts.push(typeof arguments[j] === 'string' ? arguments[j] : String(arguments[j]));
        }

        figma.ui.postMessage({
          type: 'CONSOLE_CAPTURE',
          level: level,
          message: messageParts.join(' '),
          args: args,
          timestamp: Date.now()
        });
      };
    })(levels[i]);
  }
})();

// Immediately fetch and send variables data to UI
(async () => {
  try {
    console.log('🌉 [Desktop Bridge] Fetching variables...');

    // Get all local variables and collections
    const variables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();

    console.log(`🌉 [Desktop Bridge] Found ${variables.length} variables in ${collections.length} collections`);

    // Format the data
    const variablesData = {
      success: true,
      timestamp: Date.now(),
      fileKey: figma.fileKey || null,
      variables: variables.map(v => ({
        id: v.id,
        name: v.name,
        key: v.key,
        resolvedType: v.resolvedType,
        valuesByMode: v.valuesByMode,
        variableCollectionId: v.variableCollectionId,
        scopes: v.scopes,
        description: v.description,
        hiddenFromPublishing: v.hiddenFromPublishing
      })),
      variableCollections: collections.map(c => ({
        id: c.id,
        name: c.name,
        key: c.key,
        modes: c.modes,
        defaultModeId: c.defaultModeId,
        variableIds: c.variableIds
      }))
    };

    // Send to UI via postMessage
    figma.ui.postMessage({
      type: 'VARIABLES_DATA',
      data: variablesData
    });

    console.log('🌉 [Desktop Bridge] Variables data sent to UI successfully');
    console.log('🌉 [Desktop Bridge] UI iframe now has variables data accessible via window.__figmaVariablesData');

  } catch (error) {
    console.error('🌉 [Desktop Bridge] Error fetching variables:', error);
    figma.ui.postMessage({
      type: 'ERROR',
      error: error.message || String(error)
    });
  }
})();

// Helper function to serialize a variable for response
function serializeVariable(v) {
  return {
    id: v.id,
    name: v.name,
    key: v.key,
    resolvedType: v.resolvedType,
    valuesByMode: v.valuesByMode,
    variableCollectionId: v.variableCollectionId,
    scopes: v.scopes,
    description: v.description,
    hiddenFromPublishing: v.hiddenFromPublishing
  };
}

// Helper function to serialize a collection for response
function serializeCollection(c) {
  return {
    id: c.id,
    name: c.name,
    key: c.key,
    modes: c.modes,
    defaultModeId: c.defaultModeId,
    variableIds: c.variableIds
  };
}

// --- Command result helpers (Auto Layout, Layout Sizing, etc.) ---
function ok(type, requestId, payload) {
  var out = { type: type + '_RESULT', requestId: requestId, success: true };
  if (payload && typeof payload === 'object') { for (var k in payload) { if (payload.hasOwnProperty(k)) out[k] = payload[k]; } }
  figma.ui.postMessage(out);
}
function fail(type, requestId, error) {
  figma.ui.postMessage({
    type: type + '_RESULT',
    requestId: requestId,
    success: false,
    error: String((error && error.message) || error)
  });
}
function getNode(nodeId) {
  var n = figma.getNodeById(nodeId);
  if (!n) throw new Error('Node not found: ' + nodeId);
  return n;
}
function assertType(node, allowedTypes) {
  if (allowedTypes.indexOf(node.type) === -1) {
    throw new Error('Invalid node type: ' + node.type + '. Allowed: ' + allowedTypes.join(', '));
  }
}

// Helper to convert hex color to Figma RGB (0-1 range)
function hexToFigmaRGB(hex) {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Validate hex characters BEFORE parsing (prevents NaN values)
  if (!/^[0-9A-Fa-f]+$/.test(hex)) {
    throw new Error('Invalid hex color: "' + hex + '" contains non-hex characters. Use only 0-9 and A-F.');
  }

  // Parse hex values
  var r, g, b, a = 1;

  if (hex.length === 3) {
    // #RGB format
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
  } else if (hex.length === 4) {
    // #RGBA format (CSS4 shorthand)
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
    a = parseInt(hex[3] + hex[3], 16) / 255;
  } else if (hex.length === 6) {
    // #RRGGBB format
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
  } else if (hex.length === 8) {
    // #RRGGBBAA format
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
    a = parseInt(hex.substring(6, 8), 16) / 255;
  } else {
    throw new Error('Invalid hex color format: "' + hex + '". Expected 3, 4, 6, or 8 hex characters (e.g., #RGB, #RGBA, #RRGGBB, #RRGGBBAA).');
  }

  return { r: r, g: g, b: b, a: a };
}

// Listen for requests from UI (e.g., component data requests, write operations)
figma.ui.onmessage = async (msg) => {

  // ============================================================================
  // EXECUTE_CODE - Arbitrary code execution (Power Tool)
  // ============================================================================
  if (msg.type === 'EXECUTE_CODE') {
    try {
      console.log('🌉 [Desktop Bridge] Executing code, length:', msg.code.length);

      // Use eval with async IIFE wrapper instead of AsyncFunction constructor
      // AsyncFunction is restricted in Figma's plugin sandbox, but eval works
      // See: https://developers.figma.com/docs/plugins/resource-links

      // Wrap user code in an async IIFE that returns a Promise
      // This allows async/await in user code while using eval
      var wrappedCode = "(async function() {\n" + msg.code + "\n})()";

      console.log('🌉 [Desktop Bridge] Wrapped code for eval');

      // Execute with timeout
      var timeoutMs = msg.timeout || 5000;
      var timeoutPromise = new Promise(function(_, reject) {
        setTimeout(function() {
          reject(new Error('Execution timed out after ' + timeoutMs + 'ms'));
        }, timeoutMs);
      });

      var codePromise;
      try {
        // eval returns the Promise from the async IIFE
        codePromise = eval(wrappedCode);
      } catch (syntaxError) {
        // Log the actual syntax error message
        var syntaxErrorMsg = syntaxError && syntaxError.message ? syntaxError.message : String(syntaxError);
        console.error('🌉 [Desktop Bridge] Syntax error in code:', syntaxErrorMsg);
        figma.ui.postMessage({
          type: 'EXECUTE_CODE_RESULT',
          requestId: msg.requestId,
          success: false,
          error: 'Syntax error: ' + syntaxErrorMsg
        });
        return;
      }

      var result = await Promise.race([
        codePromise,
        timeoutPromise
      ]);

      console.log('🌉 [Desktop Bridge] Code executed successfully, result type:', typeof result);

      // Analyze result for potential silent failures
      var resultAnalysis = {
        type: typeof result,
        isNull: result === null,
        isUndefined: result === undefined,
        isEmpty: false,
        warning: null
      };

      // Check for empty results that might indicate a failed search/operation
      if (Array.isArray(result)) {
        resultAnalysis.isEmpty = result.length === 0;
        if (resultAnalysis.isEmpty) {
          resultAnalysis.warning = 'Code returned an empty array. If you were searching for nodes, none were found.';
        }
      } else if (result !== null && typeof result === 'object') {
        var keys = Object.keys(result);
        resultAnalysis.isEmpty = keys.length === 0;
        if (resultAnalysis.isEmpty) {
          resultAnalysis.warning = 'Code returned an empty object. The operation may not have found what it was looking for.';
        }
        // Check for common "found nothing" patterns
        if (result.length === 0 || result.count === 0 || result.foundCount === 0 || (result.nodes && result.nodes.length === 0)) {
          resultAnalysis.warning = 'Code returned a result indicating nothing was found (count/length is 0).';
        }
      } else if (result === null) {
        resultAnalysis.warning = 'Code returned null. The requested node or resource may not exist.';
      } else if (result === undefined) {
        resultAnalysis.warning = 'Code returned undefined. Make sure your code has a return statement.';
      }

      if (resultAnalysis.warning) {
        console.warn('🌉 [Desktop Bridge] ⚠️ Result warning:', resultAnalysis.warning);
      }

      figma.ui.postMessage({
        type: 'EXECUTE_CODE_RESULT',
        requestId: msg.requestId,
        success: true,
        result: result,
        resultAnalysis: resultAnalysis,
        // Include file context so users know which file this executed against
        fileContext: {
          fileName: figma.root.name,
          fileKey: figma.fileKey || null
        }
      });

    } catch (error) {
      // Extract error message explicitly - don't rely on console.error serialization
      var errorName = error && error.name ? error.name : 'Error';
      var errorMsg = error && error.message ? error.message : String(error);
      var errorStack = error && error.stack ? error.stack : '';

      // Log error details as strings so they show up properly in Puppeteer
      console.error('🌉 [Desktop Bridge] Code execution error: [' + errorName + '] ' + errorMsg);
      if (errorStack) {
        console.error('🌉 [Desktop Bridge] Stack:', errorStack);
      }

      figma.ui.postMessage({
        type: 'EXECUTE_CODE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorName + ': ' + errorMsg
      });
    }
  }

  // ============================================================================
  // RUN_TOKEN_AUDIT_PAGE - Corrigir tokens de cor sem vínculo (só página atual)
  // Variáveis buscadas uma vez no início; processamento em lotes para não travar.
  // ============================================================================
  else if (msg.type === 'RUN_TOKEN_AUDIT_PAGE') {
    var requestId = msg.requestId;
    try {
      var iconVar = await figma.variables.getVariableByIdAsync('VariableID:13853:22293');
      var bgVar = await figma.variables.getVariableByIdAsync('VariableID:13853:22336');
      var borderVar = await figma.variables.getVariableByIdAsync('VariableID:13853:22222');
      if (!iconVar || !bgVar || !borderVar) {
        throw new Error('Variáveis de token não encontradas. Verifique a coleção Semantics.');
      }
      function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function(x) {
          var h = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16);
          return h.length === 1 ? '0' + h : h;
        }).join('');
      }
      function yieldToUI() { return new Promise(function(r) { setTimeout(r, 0); }); }
      var root = figma.currentPage;
      var unlinkedFills = [], unlinkedStrokes = [];
      var stack = [root], visited = 0;
      while (stack.length) {
        var n = stack.pop();
        if (!n) continue;
        visited++;
        if (visited % 400 === 0) await yieldToUI();
        if ('fills' in n && n.fills && n.fills.length) {
          var first = n.fills[0];
          if ((!('fillStyleId' in n) || !n.fillStyleId) && (!first.boundVariables || !first.boundVariables.color) && first.type === 'SOLID' && first.color) {
            unlinkedFills.push({ nodeId: n.id, name: n.name, fillHex: rgbToHex(first.color.r, first.color.g, first.color.b) });
          }
        }
        if ('strokes' in n && n.strokes && n.strokes.length) {
          var s = n.strokes[0];
          if ((!('strokeStyleId' in n) || !n.strokeStyleId) && (!s.boundVariables || !s.boundVariables.color) && s.type === 'SOLID' && s.color) {
            unlinkedStrokes.push({ nodeId: n.id, name: n.name });
          }
        }
        if (n.children) for (var i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
      }
      var fixed = [], BATCH = 20;
      for (var i = 0; i < unlinkedFills.length; i++) {
        var u = unlinkedFills[i];
        var node = await figma.getNodeByIdAsync(u.nodeId);
        if (!node || !node.fills || node.fills.length === 0) continue;
        var hex = (u.fillHex || '').replace('#', '').toUpperCase();
        var variable = (hex === 'FFFFFF' || hex === 'FCFCFD') ? iconVar : bgVar;
        var fillsCopy = JSON.parse(JSON.stringify(node.fills));
        if (fillsCopy[0].type === 'SOLID') {
          fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', variable);
          node.fills = fillsCopy;
          fixed.push({ nodeId: u.nodeId, kind: 'fill' });
        }
        if (fixed.length % BATCH === 0) await yieldToUI();
      }
      for (var j = 0; j < unlinkedStrokes.length; j++) {
        var u2 = unlinkedStrokes[j];
        var node2 = await figma.getNodeByIdAsync(u2.nodeId);
        if (!node2 || !node2.strokes || node2.strokes.length === 0) continue;
        var strokesCopy = JSON.parse(JSON.stringify(node2.strokes));
        if (strokesCopy[0].type === 'SOLID') {
          strokesCopy[0] = figma.variables.setBoundVariableForPaint(strokesCopy[0], 'color', borderVar);
          node2.strokes = strokesCopy;
          fixed.push({ nodeId: u2.nodeId, kind: 'stroke' });
        }
        if (fixed.length % BATCH === 0) await yieldToUI();
      }
      var res = { unlinkedFills: unlinkedFills.length, unlinkedStrokes: unlinkedStrokes.length, fixed: fixed.length, details: fixed };
      figma.notify(fixed.length > 0 ? fixed.length + ' tokens corrigidos na página' : 'Nenhuma cor solta na página', { timeout: 2500 });
      figma.ui.postMessage({ type: 'TOKEN_AUDIT_GLOBAL_RESULT', requestId: requestId, success: true, result: res });
    } catch (err) {
      var errMsg = err && err.message ? err.message : String(err);
      figma.notify('Tokens: ' + errMsg, { error: true, timeout: 4000 });
      figma.ui.postMessage({ type: 'TOKEN_AUDIT_GLOBAL_RESULT', requestId: requestId, success: false, error: errMsg });
    }
  }
  // ============================================================================
  // RUN_TOKEN_AUDIT_GLOBAL - Fix all unlinked color tokens (fills/strokes) in document
  // Only run when user explicitly requests (e.g. via plugin button). See project-overview §10.
  // ============================================================================
  else if (msg.type === 'RUN_TOKEN_AUDIT_GLOBAL') {
    try {
      var requestId = msg.requestId;
      var ICON_INVERSE_VAR = 'VariableID:13853:22293';
      var BG_NEUTRAL_BASE_VAR = 'VariableID:13853:22336';
      var BORDER_DEFAULT_VAR = 'VariableID:13853:22222';

      function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function(x) {
          var h = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16);
          return h.length === 1 ? '0' + h : h;
        }).join('');
      }

      function yieldToUI() {
        return new Promise(function(r) { setTimeout(r, 0); });
      }

      async function runSingleRoot(root) {
        var unlinkedFills = [];
        var unlinkedStrokes = [];
        var stack = [root];
        var visited = 0;
        while (stack.length) {
          var n = stack.pop();
          if (!n) continue;
          visited++;
          if (visited % 300 === 0) await yieldToUI();
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
          if (n.children) for (var i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
        }
        var fixed = [];
        var BATCH = 15;
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
          if (fixed.length % BATCH === 0 && fixed.length > 0) await yieldToUI();
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
          if (fixed.length % BATCH === 0 && fixed.length > 0) await yieldToUI();
        }
        return { unlinkedFills: unlinkedFills.length, unlinkedStrokes: unlinkedStrokes.length, fixed: fixed.length, details: fixed };
      }

      var pages = figma.root.children;
      var total = { unlinkedFills: 0, unlinkedStrokes: 0, fixed: 0, details: [], byPage: [] };
      for (var p = 0; p < pages.length; p++) {
        await yieldToUI();
        var page = pages[p];
        var res = await runSingleRoot(page);
        total.unlinkedFills += res.unlinkedFills;
        total.unlinkedStrokes += res.unlinkedStrokes;
        total.fixed += res.fixed;
        if (res.details && res.details.length) total.details = total.details.concat(res.details);
        total.byPage.push({ name: page.name, fixed: res.fixed, fills: res.unlinkedFills, strokes: res.unlinkedStrokes });
      }
      figma.notify('Tokens: ' + total.fixed + ' corrigidos no documento', { timeout: 3000 });
      figma.ui.postMessage({ type: 'TOKEN_AUDIT_GLOBAL_RESULT', requestId: msg.requestId, success: true, result: total });
    } catch (err) {
      var errMsg = err && err.message ? err.message : String(err);
      console.error('🌉 [Desktop Bridge] RUN_TOKEN_AUDIT_GLOBAL error:', errMsg);
      figma.notify('Tokens: erro – ' + errMsg, { error: true });
      figma.ui.postMessage({ type: 'TOKEN_AUDIT_GLOBAL_RESULT', requestId: msg.requestId, success: false, error: errMsg });
    }
  }

  // ============================================================================
  // UPDATE_VARIABLE - Update a variable's value in a specific mode
  // ============================================================================
  else if (msg.type === 'UPDATE_VARIABLE') {
    try {
      console.log('🌉 [Desktop Bridge] Updating variable:', msg.variableId);

      var variable = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!variable) {
        throw new Error('Variable not found: ' + msg.variableId);
      }

      // Convert value based on variable type
      var value = msg.value;

      // Check if value is a variable alias (string starting with "VariableID:")
      if (typeof value === 'string' && value.startsWith('VariableID:')) {
        // Convert to VARIABLE_ALIAS format
        value = {
          type: 'VARIABLE_ALIAS',
          id: value
        };
        console.log('🌉 [Desktop Bridge] Converting to variable alias:', value.id);
      } else if (variable.resolvedType === 'COLOR' && typeof value === 'string') {
        // Convert hex string to Figma color
        value = hexToFigmaRGB(value);
      }

      // Set the value for the specified mode
      variable.setValueForMode(msg.modeId, value);

      console.log('🌉 [Desktop Bridge] Variable updated successfully');

      figma.ui.postMessage({
        type: 'UPDATE_VARIABLE_RESULT',
        requestId: msg.requestId,
        success: true,
        variable: serializeVariable(variable)
      });

    } catch (error) {
      console.error('🌉 [Desktop Bridge] Update variable error:', error);
      figma.ui.postMessage({
        type: 'UPDATE_VARIABLE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: error.message || String(error)
      });
    }
  }

  // ============================================================================
  // CREATE_VARIABLE - Create a new variable in a collection
  // ============================================================================
  else if (msg.type === 'CREATE_VARIABLE') {
    try {
      console.log('🌉 [Desktop Bridge] Creating variable:', msg.name);

      // Get the collection
      var collection = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
      if (!collection) {
        throw new Error('Collection not found: ' + msg.collectionId);
      }

      // Create the variable
      var variable = figma.variables.createVariable(msg.name, collection, msg.resolvedType);

      // Set initial values if provided
      if (msg.valuesByMode) {
        for (var modeId in msg.valuesByMode) {
          var value = msg.valuesByMode[modeId];
          // Convert hex colors
          if (msg.resolvedType === 'COLOR' && typeof value === 'string') {
            value = hexToFigmaRGB(value);
          }
          variable.setValueForMode(modeId, value);
        }
      }

      // Set description if provided
      if (msg.description) {
        variable.description = msg.description;
      }

      // Set scopes if provided
      if (msg.scopes) {
        variable.scopes = msg.scopes;
      }

      console.log('🌉 [Desktop Bridge] Variable created:', variable.id);

      figma.ui.postMessage({
        type: 'CREATE_VARIABLE_RESULT',
        requestId: msg.requestId,
        success: true,
        variable: serializeVariable(variable)
      });

    } catch (error) {
      console.error('🌉 [Desktop Bridge] Create variable error:', error);
      figma.ui.postMessage({
        type: 'CREATE_VARIABLE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: error.message || String(error)
      });
    }
  }

  // ============================================================================
  // CREATE_VARIABLE_COLLECTION - Create a new variable collection
  // ============================================================================
  else if (msg.type === 'CREATE_VARIABLE_COLLECTION') {
    try {
      console.log('🌉 [Desktop Bridge] Creating collection:', msg.name);

      // Create the collection
      var collection = figma.variables.createVariableCollection(msg.name);

      // Rename the default mode if a name is provided
      if (msg.initialModeName && collection.modes.length > 0) {
        collection.renameMode(collection.modes[0].modeId, msg.initialModeName);
      }

      // Add additional modes if provided
      if (msg.additionalModes && msg.additionalModes.length > 0) {
        for (var i = 0; i < msg.additionalModes.length; i++) {
          collection.addMode(msg.additionalModes[i]);
        }
      }

      console.log('🌉 [Desktop Bridge] Collection created:', collection.id);

      figma.ui.postMessage({
        type: 'CREATE_VARIABLE_COLLECTION_RESULT',
        requestId: msg.requestId,
        success: true,
        collection: serializeCollection(collection)
      });

    } catch (error) {
      console.error('🌉 [Desktop Bridge] Create collection error:', error);
      figma.ui.postMessage({
        type: 'CREATE_VARIABLE_COLLECTION_RESULT',
        requestId: msg.requestId,
        success: false,
        error: error.message || String(error)
      });
    }
  }

  // ============================================================================
  // DELETE_VARIABLE - Delete a variable
  // ============================================================================
  else if (msg.type === 'DELETE_VARIABLE') {
    try {
      console.log('🌉 [Desktop Bridge] Deleting variable:', msg.variableId);

      var variable = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!variable) {
        throw new Error('Variable not found: ' + msg.variableId);
      }

      var deletedInfo = {
        id: variable.id,
        name: variable.name
      };

      variable.remove();

      console.log('🌉 [Desktop Bridge] Variable deleted');

      figma.ui.postMessage({
        type: 'DELETE_VARIABLE_RESULT',
        requestId: msg.requestId,
        success: true,
        deleted: deletedInfo
      });

    } catch (error) {
      console.error('🌉 [Desktop Bridge] Delete variable error:', error);
      figma.ui.postMessage({
        type: 'DELETE_VARIABLE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: error.message || String(error)
      });
    }
  }

  // ============================================================================
  // DELETE_VARIABLE_COLLECTION - Delete a variable collection
  // ============================================================================
  else if (msg.type === 'DELETE_VARIABLE_COLLECTION') {
    try {
      console.log('🌉 [Desktop Bridge] Deleting collection:', msg.collectionId);

      var collection = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
      if (!collection) {
        throw new Error('Collection not found: ' + msg.collectionId);
      }

      var deletedInfo = {
        id: collection.id,
        name: collection.name,
        variableCount: collection.variableIds.length
      };

      collection.remove();

      console.log('🌉 [Desktop Bridge] Collection deleted');

      figma.ui.postMessage({
        type: 'DELETE_VARIABLE_COLLECTION_RESULT',
        requestId: msg.requestId,
        success: true,
        deleted: deletedInfo
      });

    } catch (error) {
      console.error('🌉 [Desktop Bridge] Delete collection error:', error);
      figma.ui.postMessage({
        type: 'DELETE_VARIABLE_COLLECTION_RESULT',
        requestId: msg.requestId,
        success: false,
        error: error.message || String(error)
      });
    }
  }

  // ============================================================================
  // RENAME_VARIABLE - Rename a variable
  // ============================================================================
  else if (msg.type === 'RENAME_VARIABLE') {
    try {
      console.log('🌉 [Desktop Bridge] Renaming variable:', msg.variableId, 'to', msg.newName);

      var variable = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!variable) {
        throw new Error('Variable not found: ' + msg.variableId);
      }

      var oldName = variable.name;
      variable.name = msg.newName;

      console.log('🌉 [Desktop Bridge] Variable renamed from "' + oldName + '" to "' + msg.newName + '"');

      var serializedVar = serializeVariable(variable);
      serializedVar.oldName = oldName;
      figma.ui.postMessage({
        type: 'RENAME_VARIABLE_RESULT',
        requestId: msg.requestId,
        success: true,
        variable: serializedVar,
        oldName: oldName
      });

    } catch (error) {
      console.error('🌉 [Desktop Bridge] Rename variable error:', error);
      figma.ui.postMessage({
        type: 'RENAME_VARIABLE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: error.message || String(error)
      });
    }
  }

  // ============================================================================
  // SET_VARIABLE_DESCRIPTION - Set description on a variable
  // ============================================================================
  else if (msg.type === 'SET_VARIABLE_DESCRIPTION') {
    try {
      console.log('🌉 [Desktop Bridge] Setting description on variable:', msg.variableId);

      var variable = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!variable) {
        throw new Error('Variable not found: ' + msg.variableId);
      }

      variable.description = msg.description || '';

      console.log('🌉 [Desktop Bridge] Variable description set successfully');

      figma.ui.postMessage({
        type: 'SET_VARIABLE_DESCRIPTION_RESULT',
        requestId: msg.requestId,
        success: true,
        variable: serializeVariable(variable)
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Set variable description error:', errorMsg);
      figma.ui.postMessage({
        type: 'SET_VARIABLE_DESCRIPTION_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // ADD_MODE - Add a mode to a variable collection
  // ============================================================================
  else if (msg.type === 'ADD_MODE') {
    try {
      console.log('🌉 [Desktop Bridge] Adding mode to collection:', msg.collectionId);

      var collection = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
      if (!collection) {
        throw new Error('Collection not found: ' + msg.collectionId);
      }

      // Add the mode (returns the new mode ID)
      var newModeId = collection.addMode(msg.modeName);

      console.log('🌉 [Desktop Bridge] Mode "' + msg.modeName + '" added with ID:', newModeId);

      figma.ui.postMessage({
        type: 'ADD_MODE_RESULT',
        requestId: msg.requestId,
        success: true,
        collection: serializeCollection(collection),
        newMode: {
          modeId: newModeId,
          name: msg.modeName
        }
      });

    } catch (error) {
      console.error('🌉 [Desktop Bridge] Add mode error:', error);
      figma.ui.postMessage({
        type: 'ADD_MODE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: error.message || String(error)
      });
    }
  }

  // ============================================================================
  // RENAME_MODE - Rename a mode in a variable collection
  // ============================================================================
  else if (msg.type === 'RENAME_MODE') {
    try {
      console.log('🌉 [Desktop Bridge] Renaming mode:', msg.modeId, 'in collection:', msg.collectionId);

      var collection = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
      if (!collection) {
        throw new Error('Collection not found: ' + msg.collectionId);
      }

      // Find the current mode name
      var currentMode = collection.modes.find(function(m) { return m.modeId === msg.modeId; });
      if (!currentMode) {
        throw new Error('Mode not found: ' + msg.modeId);
      }

      var oldName = currentMode.name;
      collection.renameMode(msg.modeId, msg.newName);

      console.log('🌉 [Desktop Bridge] Mode renamed from "' + oldName + '" to "' + msg.newName + '"');

      var serializedCol = serializeCollection(collection);
      serializedCol.oldName = oldName;
      figma.ui.postMessage({
        type: 'RENAME_MODE_RESULT',
        requestId: msg.requestId,
        success: true,
        collection: serializedCol,
        oldName: oldName
      });

    } catch (error) {
      console.error('🌉 [Desktop Bridge] Rename mode error:', error);
      figma.ui.postMessage({
        type: 'RENAME_MODE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: error.message || String(error)
      });
    }
  }

  // ============================================================================
  // REFRESH_VARIABLES - Re-fetch and send all variables data
  // ============================================================================
  else if (msg.type === 'REFRESH_VARIABLES') {
    try {
      console.log('🌉 [Desktop Bridge] Refreshing variables data...');

      var variables = await figma.variables.getLocalVariablesAsync();
      var collections = await figma.variables.getLocalVariableCollectionsAsync();

      var variablesData = {
        success: true,
        timestamp: Date.now(),
        fileKey: figma.fileKey || null,
        variables: variables.map(serializeVariable),
        variableCollections: collections.map(serializeCollection)
      };

      // Update the UI's cached data
      figma.ui.postMessage({
        type: 'VARIABLES_DATA',
        data: variablesData
      });

      // Also send as a response to the request
      figma.ui.postMessage({
        type: 'REFRESH_VARIABLES_RESULT',
        requestId: msg.requestId,
        success: true,
        data: variablesData
      });

      console.log('🌉 [Desktop Bridge] Variables refreshed:', variables.length, 'variables in', collections.length, 'collections');

    } catch (error) {
      console.error('🌉 [Desktop Bridge] Refresh variables error:', error);
      figma.ui.postMessage({
        type: 'REFRESH_VARIABLES_RESULT',
        requestId: msg.requestId,
        success: false,
        error: error.message || String(error)
      });
    }
  }

  // ============================================================================
  // GET_COMPONENT - Existing read operation
  // ============================================================================
  else if (msg.type === 'GET_COMPONENT') {
    try {
      console.log(`🌉 [Desktop Bridge] Fetching component: ${msg.nodeId}`);

      const node = await figma.getNodeByIdAsync(msg.nodeId);

      if (!node) {
        throw new Error(`Node not found: ${msg.nodeId}`);
      }

      if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET' && node.type !== 'INSTANCE') {
        throw new Error(`Node is not a component. Type: ${node.type}`);
      }

      // Detect if this is a variant (COMPONENT inside a COMPONENT_SET)
      // Note: Can't use optional chaining (?.) - Figma plugin sandbox doesn't support it
      const isVariant = node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET';

      // Extract component data including description fields and annotations
      const componentData = {
        success: true,
        timestamp: Date.now(),
        nodeId: msg.nodeId,
        component: {
          id: node.id,
          name: node.name,
          type: node.type,
          // Variants CAN have their own description
          description: node.description || null,
          descriptionMarkdown: node.descriptionMarkdown || null,
          visible: node.visible,
          locked: node.locked,
          // Dev Mode annotations
          annotations: node.annotations || [],
          // Flag to indicate if this is a variant
          isVariant: isVariant,
          // For component sets and non-variant components only (variants cannot access this)
          componentPropertyDefinitions: (node.type === 'COMPONENT_SET' || (node.type === 'COMPONENT' && !isVariant))
            ? node.componentPropertyDefinitions
            : undefined,
          // Get children info (lightweight)
          children: node.children ? node.children.map(child => ({
            id: child.id,
            name: child.name,
            type: child.type
          })) : undefined
        }
      };

      console.log(`🌉 [Desktop Bridge] Component data ready. Has description: ${!!componentData.component.description}, annotations: ${componentData.component.annotations.length}`);

      // Send to UI
      figma.ui.postMessage({
        type: 'COMPONENT_DATA',
        requestId: msg.requestId, // Echo back the request ID
        data: componentData
      });

    } catch (error) {
      console.error(`🌉 [Desktop Bridge] Error fetching component:`, error);
      figma.ui.postMessage({
        type: 'COMPONENT_ERROR',
        requestId: msg.requestId,
        error: error.message || String(error)
      });
    }
  }

  // ============================================================================
  // GET_LOCAL_COMPONENTS - Get all local components for design system manifest
  // ============================================================================
  else if (msg.type === 'GET_LOCAL_COMPONENTS') {
    try {
      console.log('🌉 [Desktop Bridge] Fetching all local components for manifest...');

      // Find all component sets and standalone components in the file
      var components = [];
      var componentSets = [];

      // Helper to extract component data
      function extractComponentData(node, isPartOfSet) {
        var data = {
          key: node.key,
          nodeId: node.id,
          name: node.name,
          type: node.type,
          description: node.description || null,
          width: node.width,
          height: node.height
        };

        // Get property definitions for non-variant components
        if (!isPartOfSet && node.componentPropertyDefinitions) {
          data.properties = [];
          var propDefs = node.componentPropertyDefinitions;
          for (var propName in propDefs) {
            if (propDefs.hasOwnProperty(propName)) {
              var propDef = propDefs[propName];
              data.properties.push({
                name: propName,
                type: propDef.type,
                defaultValue: propDef.defaultValue
              });
            }
          }
        }

        return data;
      }

      // Helper to extract component set data with all variants
      function extractComponentSetData(node) {
        var variantAxes = {};
        var variants = [];

        // Parse variant properties from children names
        if (node.children) {
          node.children.forEach(function(child) {
            if (child.type === 'COMPONENT') {
              // Parse variant name (e.g., "Size=md, State=default")
              var variantProps = {};
              var parts = child.name.split(',').map(function(p) { return p.trim(); });
              parts.forEach(function(part) {
                var kv = part.split('=');
                if (kv.length === 2) {
                  var key = kv[0].trim();
                  var value = kv[1].trim();
                  variantProps[key] = value;

                  // Track all values for each axis
                  if (!variantAxes[key]) {
                    variantAxes[key] = [];
                  }
                  if (variantAxes[key].indexOf(value) === -1) {
                    variantAxes[key].push(value);
                  }
                }
              });

              variants.push({
                key: child.key,
                nodeId: child.id,
                name: child.name,
                description: child.description || null,
                variantProperties: variantProps,
                width: child.width,
                height: child.height
              });
            }
          });
        }

        // Convert variantAxes object to array format
        var axes = [];
        for (var axisName in variantAxes) {
          if (variantAxes.hasOwnProperty(axisName)) {
            axes.push({
              name: axisName,
              values: variantAxes[axisName]
            });
          }
        }

        return {
          key: node.key,
          nodeId: node.id,
          name: node.name,
          type: 'COMPONENT_SET',
          description: node.description || null,
          variantAxes: axes,
          variants: variants,
          defaultVariant: variants.length > 0 ? variants[0] : null,
          properties: node.componentPropertyDefinitions ? Object.keys(node.componentPropertyDefinitions).map(function(propName) {
            var propDef = node.componentPropertyDefinitions[propName];
            return {
              name: propName,
              type: propDef.type,
              defaultValue: propDef.defaultValue
            };
          }) : []
        };
      }

      // Recursively search for components
      function findComponents(node) {
        if (!node) return;

        if (node.type === 'COMPONENT_SET') {
          componentSets.push(extractComponentSetData(node));
        } else if (node.type === 'COMPONENT') {
          // Only add standalone components (not variants inside component sets)
          if (!node.parent || node.parent.type !== 'COMPONENT_SET') {
            components.push(extractComponentData(node, false));
          }
        }

        // Recurse into children
        if (node.children) {
          node.children.forEach(function(child) {
            findComponents(child);
          });
        }
      }

      // Load all pages first (required before accessing children)
      console.log('🌉 [Desktop Bridge] Loading all pages...');
      await figma.loadAllPagesAsync();

      // Process pages in batches with event loop yields to prevent UI freeze
      // This is critical for large design systems that could otherwise crash
      var pages = figma.root.children;
      var PAGE_BATCH_SIZE = 3;  // Process 3 pages at a time
      var totalPages = pages.length;

      console.log('🌉 [Desktop Bridge] Processing ' + totalPages + ' pages in batches of ' + PAGE_BATCH_SIZE + '...');

      for (var pageIndex = 0; pageIndex < totalPages; pageIndex += PAGE_BATCH_SIZE) {
        var batchEnd = Math.min(pageIndex + PAGE_BATCH_SIZE, totalPages);
        var batchPages = [];
        for (var j = pageIndex; j < batchEnd; j++) {
          batchPages.push(pages[j]);
        }

        // Process this batch of pages
        batchPages.forEach(function(page) {
          findComponents(page);
        });

        // Log progress for large files
        if (totalPages > PAGE_BATCH_SIZE) {
          console.log('🌉 [Desktop Bridge] Processed pages ' + (pageIndex + 1) + '-' + batchEnd + ' of ' + totalPages + ' (found ' + components.length + ' components so far)');
        }

        // Yield to event loop between batches to prevent UI freeze and allow cancellation
        if (batchEnd < totalPages) {
          await new Promise(function(resolve) { setTimeout(resolve, 0); });
        }
      }

      console.log('🌉 [Desktop Bridge] Found ' + components.length + ' components and ' + componentSets.length + ' component sets');

      figma.ui.postMessage({
        type: 'GET_LOCAL_COMPONENTS_RESULT',
        requestId: msg.requestId,
        success: true,
        data: {
          components: components,
          componentSets: componentSets,
          totalComponents: components.length,
          totalComponentSets: componentSets.length,
          // Include file metadata for context verification
          fileName: figma.root.name,
          fileKey: figma.fileKey || null,
          timestamp: Date.now()
        }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Get local components error:', errorMsg);
      figma.ui.postMessage({
        type: 'GET_LOCAL_COMPONENTS_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // INSTANTIATE_COMPONENT - Create a component instance with overrides
  // ============================================================================
  else if (msg.type === 'INSTANTIATE_COMPONENT') {
    try {
      console.log('🌉 [Desktop Bridge] Instantiating component:', msg.componentKey || msg.nodeId);

      var component = null;
      var instance = null;

      // Try published library first (by key), then fall back to local component (by nodeId)
      if (msg.componentKey) {
        try {
          component = await figma.importComponentByKeyAsync(msg.componentKey);
        } catch (importError) {
          console.log('🌉 [Desktop Bridge] Not a published component, trying local...');
        }
      }

      // Fall back to local component by nodeId
      if (!component && msg.nodeId) {
        var node = await figma.getNodeByIdAsync(msg.nodeId);
        if (node) {
          if (node.type === 'COMPONENT') {
            component = node;
          } else if (node.type === 'COMPONENT_SET') {
            // For component sets, find the right variant or use default
            if (msg.variant && node.children && node.children.length > 0) {
              // Build variant name from properties (e.g., "Type=Simple, State=Default")
              var variantParts = [];
              for (var prop in msg.variant) {
                if (msg.variant.hasOwnProperty(prop)) {
                  variantParts.push(prop + '=' + msg.variant[prop]);
                }
              }
              var targetVariantName = variantParts.join(', ');
              console.log('🌉 [Desktop Bridge] Looking for variant:', targetVariantName);

              // Find matching variant
              for (var i = 0; i < node.children.length; i++) {
                var child = node.children[i];
                if (child.type === 'COMPONENT' && child.name === targetVariantName) {
                  component = child;
                  console.log('🌉 [Desktop Bridge] Found exact variant match');
                  break;
                }
              }

              // If no exact match, try partial match
              if (!component) {
                for (var i = 0; i < node.children.length; i++) {
                  var child = node.children[i];
                  if (child.type === 'COMPONENT') {
                    var matches = true;
                    for (var prop in msg.variant) {
                      if (msg.variant.hasOwnProperty(prop)) {
                        var expected = prop + '=' + msg.variant[prop];
                        if (child.name.indexOf(expected) === -1) {
                          matches = false;
                          break;
                        }
                      }
                    }
                    if (matches) {
                      component = child;
                      console.log('🌉 [Desktop Bridge] Found partial variant match:', child.name);
                      break;
                    }
                  }
                }
              }
            }

            // Default to first variant if no match
            if (!component && node.children && node.children.length > 0) {
              component = node.children[0];
              console.log('🌉 [Desktop Bridge] Using default variant:', component.name);
            }
          }
        }
      }

      if (!component) {
        // Build detailed error message with actionable guidance
        var errorParts = ['Component not found.'];

        if (msg.componentKey && !msg.nodeId) {
          errorParts.push('Component key "' + msg.componentKey + '" not found. Note: componentKey only works for components from published libraries. For local/unpublished components, you must provide nodeId instead.');
        } else if (msg.componentKey && msg.nodeId) {
          errorParts.push('Neither componentKey "' + msg.componentKey + '" nor nodeId "' + msg.nodeId + '" resolved to a valid component. The identifiers may be stale from a previous session.');
        } else if (msg.nodeId) {
          errorParts.push('NodeId "' + msg.nodeId + '" does not exist in this file. NodeIds are session-specific and become stale when Figma restarts or the file is closed.');
        } else {
          errorParts.push('No componentKey or nodeId was provided.');
        }

        errorParts.push('SOLUTION: Call figma_search_components to get fresh identifiers, then pass BOTH componentKey AND nodeId together for reliable instantiation.');

        throw new Error(errorParts.join(' '));
      }

      // Create the instance
      instance = component.createInstance();

      // Apply position if specified
      if (msg.position) {
        instance.x = msg.position.x || 0;
        instance.y = msg.position.y || 0;
      }

      // Apply size override if specified
      if (msg.size) {
        instance.resize(msg.size.width, msg.size.height);
      }

      // Apply property overrides
      if (msg.overrides) {
        for (var propName in msg.overrides) {
          if (msg.overrides.hasOwnProperty(propName)) {
            try {
              instance.setProperties({ [propName]: msg.overrides[propName] });
            } catch (propError) {
              console.warn('🌉 [Desktop Bridge] Could not set property ' + propName + ':', propError.message);
            }
          }
        }
      }

      // Apply variant selection if specified
      if (msg.variant) {
        try {
          instance.setProperties(msg.variant);
        } catch (variantError) {
          console.warn('🌉 [Desktop Bridge] Could not set variant:', variantError.message);
        }
      }

      // Append to parent if specified
      if (msg.parentId) {
        var parent = await figma.getNodeByIdAsync(msg.parentId);
        if (parent && 'appendChild' in parent) {
          parent.appendChild(instance);
        }
      }

      console.log('🌉 [Desktop Bridge] Component instantiated:', instance.id);

      figma.ui.postMessage({
        type: 'INSTANTIATE_COMPONENT_RESULT',
        requestId: msg.requestId,
        success: true,
        instance: {
          id: instance.id,
          name: instance.name,
          x: instance.x,
          y: instance.y,
          width: instance.width,
          height: instance.height
        }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Instantiate component error:', errorMsg);
      figma.ui.postMessage({
        type: 'INSTANTIATE_COMPONENT_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // SET_NODE_DESCRIPTION - Set description on component/style
  // ============================================================================
  else if (msg.type === 'SET_NODE_DESCRIPTION') {
    try {
      console.log('🌉 [Desktop Bridge] Setting description on node:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      // Check if node supports description
      if (!('description' in node)) {
        throw new Error('Node type ' + node.type + ' does not support description');
      }

      // Set description (and markdown if supported)
      node.description = msg.description || '';
      if (msg.descriptionMarkdown && 'descriptionMarkdown' in node) {
        node.descriptionMarkdown = msg.descriptionMarkdown;
      }

      console.log('🌉 [Desktop Bridge] Description set successfully');

      figma.ui.postMessage({
        type: 'SET_NODE_DESCRIPTION_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: node.id, name: node.name, description: node.description }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Set description error:', errorMsg);
      figma.ui.postMessage({
        type: 'SET_NODE_DESCRIPTION_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // ADD_COMPONENT_PROPERTY - Add property to component
  // ============================================================================
  else if (msg.type === 'ADD_COMPONENT_PROPERTY') {
    try {
      console.log('🌉 [Desktop Bridge] Adding component property:', msg.propertyName, 'type:', msg.propertyType);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
        throw new Error('Node must be a COMPONENT or COMPONENT_SET. Got: ' + node.type);
      }

      // Check if it's a variant (can't add properties to variants)
      if (node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET') {
        throw new Error('Cannot add properties to variant components. Add to the parent COMPONENT_SET instead.');
      }

      // Build options if preferredValues provided
      var options = undefined;
      if (msg.preferredValues) {
        options = { preferredValues: msg.preferredValues };
      }

      // Use msg.propertyType (not msg.type which is the message type 'ADD_COMPONENT_PROPERTY')
      var propertyNameWithId = node.addComponentProperty(msg.propertyName, msg.propertyType, msg.defaultValue, options);

      console.log('🌉 [Desktop Bridge] Property added:', propertyNameWithId);

      figma.ui.postMessage({
        type: 'ADD_COMPONENT_PROPERTY_RESULT',
        requestId: msg.requestId,
        success: true,
        propertyName: propertyNameWithId
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Add component property error:', errorMsg);
      figma.ui.postMessage({
        type: 'ADD_COMPONENT_PROPERTY_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // EDIT_COMPONENT_PROPERTY - Edit existing component property
  // ============================================================================
  else if (msg.type === 'EDIT_COMPONENT_PROPERTY') {
    try {
      console.log('🌉 [Desktop Bridge] Editing component property:', msg.propertyName);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
        throw new Error('Node must be a COMPONENT or COMPONENT_SET. Got: ' + node.type);
      }

      var propertyNameWithId = node.editComponentProperty(msg.propertyName, msg.newValue);

      console.log('🌉 [Desktop Bridge] Property edited:', propertyNameWithId);

      figma.ui.postMessage({
        type: 'EDIT_COMPONENT_PROPERTY_RESULT',
        requestId: msg.requestId,
        success: true,
        propertyName: propertyNameWithId
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Edit component property error:', errorMsg);
      figma.ui.postMessage({
        type: 'EDIT_COMPONENT_PROPERTY_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // DELETE_COMPONENT_PROPERTY - Delete a component property
  // ============================================================================
  else if (msg.type === 'DELETE_COMPONENT_PROPERTY') {
    try {
      console.log('🌉 [Desktop Bridge] Deleting component property:', msg.propertyName);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
        throw new Error('Node must be a COMPONENT or COMPONENT_SET. Got: ' + node.type);
      }

      node.deleteComponentProperty(msg.propertyName);

      console.log('🌉 [Desktop Bridge] Property deleted');

      figma.ui.postMessage({
        type: 'DELETE_COMPONENT_PROPERTY_RESULT',
        requestId: msg.requestId,
        success: true
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Delete component property error:', errorMsg);
      figma.ui.postMessage({
        type: 'DELETE_COMPONENT_PROPERTY_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // RESIZE_NODE - Resize any node
  // ============================================================================
  else if (msg.type === 'RESIZE_NODE') {
    try {
      console.log('🌉 [Desktop Bridge] Resizing node:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (!('resize' in node)) {
        throw new Error('Node type ' + node.type + ' does not support resize');
      }

      if (msg.withConstraints) {
        node.resize(msg.width, msg.height);
      } else {
        node.resizeWithoutConstraints(msg.width, msg.height);
      }

      console.log('🌉 [Desktop Bridge] Node resized to:', msg.width, 'x', msg.height);

      figma.ui.postMessage({
        type: 'RESIZE_NODE_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: node.id, name: node.name, width: node.width, height: node.height }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Resize node error:', errorMsg);
      figma.ui.postMessage({
        type: 'RESIZE_NODE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // MOVE_NODE - Move/position a node
  // ============================================================================
  else if (msg.type === 'MOVE_NODE') {
    try {
      console.log('🌉 [Desktop Bridge] Moving node:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (!('x' in node)) {
        throw new Error('Node type ' + node.type + ' does not support positioning');
      }

      node.x = msg.x;
      node.y = msg.y;

      console.log('🌉 [Desktop Bridge] Node moved to:', msg.x, ',', msg.y);

      figma.ui.postMessage({
        type: 'MOVE_NODE_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: node.id, name: node.name, x: node.x, y: node.y }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Move node error:', errorMsg);
      figma.ui.postMessage({
        type: 'MOVE_NODE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // SET_NODE_FILLS - Set fills (colors) on a node
  // ============================================================================
  else if (msg.type === 'SET_NODE_FILLS') {
    try {
      console.log('🌉 [Desktop Bridge] Setting fills on node:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (!('fills' in node)) {
        throw new Error('Node type ' + node.type + ' does not support fills');
      }

      // Process fills - convert hex colors if needed
      var processedFills = msg.fills.map(function(fill) {
        if (fill.type === 'SOLID' && typeof fill.color === 'string') {
          // Convert hex to RGB
          var rgb = hexToFigmaRGB(fill.color);
          return {
            type: 'SOLID',
            color: { r: rgb.r, g: rgb.g, b: rgb.b },
            opacity: rgb.a !== undefined ? rgb.a : (fill.opacity !== undefined ? fill.opacity : 1)
          };
        }
        return fill;
      });

      node.fills = processedFills;

      console.log('🌉 [Desktop Bridge] Fills set successfully');

      figma.ui.postMessage({
        type: 'SET_NODE_FILLS_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: node.id, name: node.name }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Set fills error:', errorMsg);
      figma.ui.postMessage({
        type: 'SET_NODE_FILLS_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // SET_NODE_FILL_STYLE - Link node fill to a style (token)
  // ============================================================================
  else if (msg.type === 'SET_NODE_FILL_STYLE') {
    try {
      console.log('🌉 [Desktop Bridge] Setting fill style on node:', msg.nodeId, 'styleId:', msg.styleId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (!('fillStyleId' in node)) {
        throw new Error('Node type ' + node.type + ' does not support fillStyleId');
      }

      var styleId = String(msg.styleId).trim();
      // Try as-is first; some APIs return "S:hash," so try without prefix/suffix if not found
      var style = figma.getStyleById(styleId);
      if (!style && styleId.indexOf('S:') === 0) {
        styleId = styleId.slice(2);
        if (styleId.endsWith(',')) styleId = styleId.slice(0, -1);
        style = figma.getStyleById(styleId);
      }
      if (!style || style.type !== 'PAINT') {
        throw new Error('Style not found or not a paint style: ' + msg.styleId);
      }

      node.fillStyleId = style.id;

      console.log('🌉 [Desktop Bridge] Fill style set successfully');

      figma.ui.postMessage({
        type: 'SET_NODE_FILL_STYLE_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: node.id, name: node.name }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Set fill style error:', errorMsg);
      figma.ui.postMessage({
        type: 'SET_NODE_FILL_STYLE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // SET_NODE_FILL_VARIABLE - Bind node fill to a Variable (Variables panel)
  // ============================================================================
  else if (msg.type === 'SET_NODE_FILL_VARIABLE') {
    try {
      console.log('🌉 [Desktop Bridge] Setting fill variable on node:', msg.nodeId, 'variableId:', msg.variableId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }
      if (!('fills' in node) || !node.fills || node.fills.length === 0) {
        throw new Error('Node has no fills');
      }

      var variable = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!variable) {
        throw new Error('Variable not found: ' + msg.variableId);
      }
      if (variable.resolvedType !== 'COLOR') {
        throw new Error('Variable is not a color variable: ' + msg.variableId);
      }

      var fillsCopy = JSON.parse(JSON.stringify(node.fills));
      if (fillsCopy[0].type !== 'SOLID') {
        throw new Error('First fill is not SOLID');
      }
      fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', variable);
      node.fills = fillsCopy;

      console.log('🌉 [Desktop Bridge] Fill variable set successfully');

      figma.ui.postMessage({
        type: 'SET_NODE_FILL_VARIABLE_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: node.id, name: node.name }
      });
    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Set fill variable error:', errorMsg);
      figma.ui.postMessage({
        type: 'SET_NODE_FILL_VARIABLE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // GET_NODES_WITH_UNLINKED_FILLS - Collect nodes that have fill but no fillStyleId and no variable binding
  // ============================================================================
  else if (msg.type === 'GET_NODES_WITH_UNLINKED_FILLS') {
    try {
      var rootId = msg.nodeId || (figma.currentPage && figma.currentPage.id);
      if (!rootId) {
        throw new Error('No nodeId and no current page');
      }
      var root = await figma.getNodeByIdAsync(rootId);
      if (!root) {
        throw new Error('Node not found: ' + rootId);
      }

      function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function(x) {
          var h = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16);
          return h.length === 1 ? '0' + h : h;
        }).join('');
      }

      var list = [];
      function walk(node) {
        if (!node || !('fills' in node)) return;
        var fills = node.fills;
        if (!fills || fills.length === 0) return;
        var hasStyleId = 'fillStyleId' in node && node.fillStyleId && String(node.fillStyleId).length > 0;
        if (hasStyleId) return;
        var first = fills[0];
        var hasVariableBinding = first && first.boundVariables && first.boundVariables.color;
        if (hasVariableBinding) return;
        if (first.type === 'SOLID' && first.color) {
          var c = first.color;
          var opacity = first.opacity != null ? first.opacity : 1;
          var hex = rgbToHex(c.r, c.g, c.b);
          if (opacity < 1) hex += Math.round(opacity * 255).toString(16).padStart(2, '0');
          list.push({ nodeId: node.id, name: node.name, fillHex: hex, opacity: opacity });
        }
        if (node.children) {
          for (var i = 0; i < node.children.length; i++) {
            walk(node.children[i]);
          }
        }
      }
      walk(root);

      figma.ui.postMessage({
        type: 'GET_NODES_WITH_UNLINKED_FILLS_RESULT',
        requestId: msg.requestId,
        success: true,
        nodes: list
      });
    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Get unlinked fills error:', errorMsg);
      figma.ui.postMessage({
        type: 'GET_NODES_WITH_UNLINKED_FILLS_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg,
        nodes: []
      });
    }
  }

  // ============================================================================
  // AUDIT_AND_LINK_UNLINKED_FILLS - Find fills without variable binding and link to matching variable
  // ============================================================================
  else if (msg.type === 'AUDIT_AND_LINK_UNLINKED_FILLS') {
    try {
      var rootId = msg.nodeId || (figma.currentPage && figma.currentPage.id);
      if (!rootId) {
        throw new Error('No nodeId and no current page');
      }
      var root = await figma.getNodeByIdAsync(rootId);
      if (!root) {
        throw new Error('Node not found: ' + rootId);
      }

      function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function(x) {
          var h = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16);
          return (h.length === 1 ? '0' + h : h).toUpperCase();
        }).join('');
      }

      var unlinked = [];
      function walk(node) {
        if (!node || !('fills' in node)) return;
        var fills = node.fills;
        if (!fills || fills.length === 0) return;
        var hasStyleId = 'fillStyleId' in node && node.fillStyleId && String(node.fillStyleId).length > 0;
        if (hasStyleId) return;
        var first = fills[0];
        var hasVariableBinding = first && first.boundVariables && first.boundVariables.color;
        if (hasVariableBinding) return;
        if (first.type === 'SOLID' && first.color) {
          var c = first.color;
          var hex = rgbToHex(c.r, c.g, c.b);
          unlinked.push({ nodeId: node.id, name: node.name, fillHex: hex });
        }
        if (node.children) {
          for (var i = 0; i < node.children.length; i++) walk(node.children[i]);
        }
      }
      walk(root);

      var variables = await figma.variables.getLocalVariablesAsync();
      var hexToVar = {};
      for (var v = 0; v < variables.length; v++) {
        var variable = variables[v];
        if (variable.resolvedType !== 'COLOR') continue;
        var modes = variable.valuesByMode;
        var modeIds = Object.keys(modes);
        if (modeIds.length === 0) continue;
        var val = modes[modeIds[0]];
        if (val && typeof val === 'object' && 'r' in val && 'g' in val && 'b' in val) {
          var hex = rgbToHex(val.r, val.g, val.b);
          if (!hexToVar[hex]) hexToVar[hex] = variable;
        }
      }

      var linked = [];
      var noMatch = [];
      for (var u = 0; u < unlinked.length; u++) {
        var item = unlinked[u];
        var variable = hexToVar[item.fillHex];
        if (variable) {
          try {
            var n = await figma.getNodeByIdAsync(item.nodeId);
            if (!n || !('fills' in n) || !n.fills || n.fills[0].type !== 'SOLID') {
              noMatch.push({ nodeId: item.nodeId, name: item.name, fillHex: item.fillHex });
              continue;
            }
            var variableRef = await figma.variables.getVariableByIdAsync(variable.id);
            if (!variableRef || variableRef.resolvedType !== 'COLOR') {
              noMatch.push({ nodeId: item.nodeId, name: item.name, fillHex: item.fillHex });
              continue;
            }
            var fillsCopy = JSON.parse(JSON.stringify(n.fills));
            fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', variableRef);
            n.fills = fillsCopy;
            linked.push({ nodeId: item.nodeId, name: item.name, fillHex: item.fillHex, variableName: variable.name, variableId: variable.id });
          } catch (e) {
            noMatch.push({ nodeId: item.nodeId, name: item.name, fillHex: item.fillHex, error: e.message });
          }
        } else {
          noMatch.push({ nodeId: item.nodeId, name: item.name, fillHex: item.fillHex });
        }
      }

      figma.ui.postMessage({
        type: 'AUDIT_AND_LINK_UNLINKED_FILLS_RESULT',
        requestId: msg.requestId,
        success: true,
        linked: linked,
        noMatch: noMatch,
        totalUnlinked: unlinked.length,
        totalColorVariables: Object.keys(hexToVar).length
      });
    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Audit and link unlinked fills error:', errorMsg);
      figma.ui.postMessage({
        type: 'AUDIT_AND_LINK_UNLINKED_FILLS_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg,
        linked: [],
        noMatch: []
      });
    }
  }

  // ============================================================================
  // SET_NODE_STROKES - Set strokes on a node
  // ============================================================================
  else if (msg.type === 'SET_NODE_STROKES') {
    try {
      console.log('🌉 [Desktop Bridge] Setting strokes on node:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (!('strokes' in node)) {
        throw new Error('Node type ' + node.type + ' does not support strokes');
      }

      // Process strokes - convert hex colors if needed
      var processedStrokes = msg.strokes.map(function(stroke) {
        if (stroke.type === 'SOLID' && typeof stroke.color === 'string') {
          var rgb = hexToFigmaRGB(stroke.color);
          return {
            type: 'SOLID',
            color: { r: rgb.r, g: rgb.g, b: rgb.b },
            opacity: rgb.a !== undefined ? rgb.a : (stroke.opacity !== undefined ? stroke.opacity : 1)
          };
        }
        return stroke;
      });

      node.strokes = processedStrokes;

      if (msg.strokeWeight !== undefined) {
        node.strokeWeight = msg.strokeWeight;
      }

      console.log('🌉 [Desktop Bridge] Strokes set successfully');

      figma.ui.postMessage({
        type: 'SET_NODE_STROKES_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: node.id, name: node.name }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Set strokes error:', errorMsg);
      figma.ui.postMessage({
        type: 'SET_NODE_STROKES_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // SET_NODE_OPACITY - Set opacity on a node
  // ============================================================================
  else if (msg.type === 'SET_NODE_OPACITY') {
    try {
      console.log('🌉 [Desktop Bridge] Setting opacity on node:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (!('opacity' in node)) {
        throw new Error('Node type ' + node.type + ' does not support opacity');
      }

      node.opacity = Math.max(0, Math.min(1, msg.opacity));

      console.log('🌉 [Desktop Bridge] Opacity set to:', node.opacity);

      figma.ui.postMessage({
        type: 'SET_NODE_OPACITY_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: node.id, name: node.name, opacity: node.opacity }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Set opacity error:', errorMsg);
      figma.ui.postMessage({
        type: 'SET_NODE_OPACITY_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // SET_NODE_CORNER_RADIUS - Set corner radius on a node
  // ============================================================================
  else if (msg.type === 'SET_NODE_CORNER_RADIUS') {
    try {
      console.log('🌉 [Desktop Bridge] Setting corner radius on node:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (!('cornerRadius' in node)) {
        throw new Error('Node type ' + node.type + ' does not support corner radius');
      }

      node.cornerRadius = msg.radius;

      console.log('🌉 [Desktop Bridge] Corner radius set to:', msg.radius);

      figma.ui.postMessage({
        type: 'SET_NODE_CORNER_RADIUS_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: node.id, name: node.name, cornerRadius: node.cornerRadius }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Set corner radius error:', errorMsg);
      figma.ui.postMessage({
        type: 'SET_NODE_CORNER_RADIUS_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // CLONE_NODE - Clone/duplicate a node
  // ============================================================================
  else if (msg.type === 'CLONE_NODE') {
    try {
      console.log('🌉 [Desktop Bridge] Cloning node:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (!('clone' in node)) {
        throw new Error('Node type ' + node.type + ' does not support cloning');
      }

      var clonedNode = node.clone();

      console.log('🌉 [Desktop Bridge] Node cloned:', clonedNode.id);

      figma.ui.postMessage({
        type: 'CLONE_NODE_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: clonedNode.id, name: clonedNode.name, x: clonedNode.x, y: clonedNode.y }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Clone node error:', errorMsg);
      figma.ui.postMessage({
        type: 'CLONE_NODE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // DELETE_NODE - Delete a node
  // ============================================================================
  else if (msg.type === 'DELETE_NODE') {
    try {
      console.log('🌉 [Desktop Bridge] Deleting node:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      var deletedInfo = { id: node.id, name: node.name };

      node.remove();

      console.log('🌉 [Desktop Bridge] Node deleted');

      figma.ui.postMessage({
        type: 'DELETE_NODE_RESULT',
        requestId: msg.requestId,
        success: true,
        deleted: deletedInfo
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Delete node error:', errorMsg);
      figma.ui.postMessage({
        type: 'DELETE_NODE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // RENAME_NODE - Rename a node
  // ============================================================================
  else if (msg.type === 'RENAME_NODE') {
    try {
      console.log('🌉 [Desktop Bridge] Renaming node:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      var oldName = node.name;
      node.name = msg.newName;

      console.log('🌉 [Desktop Bridge] Node renamed from "' + oldName + '" to "' + msg.newName + '"');

      figma.ui.postMessage({
        type: 'RENAME_NODE_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: node.id, name: node.name, oldName: oldName },
        oldName: oldName
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Rename node error:', errorMsg);
      figma.ui.postMessage({
        type: 'RENAME_NODE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // SET_ALL_TEXT_LAYERS - Set all TEXT layers in the document to a given string
  // Processes in batches to avoid timeout on large files
  // ============================================================================
  else if (msg.type === 'SET_ALL_TEXT_LAYERS') {
    try {
      var targetText = msg.text != null ? String(msg.text) : '{Text}';
      console.log('🌉 [Desktop Bridge] Setting all TEXT layers to:', targetText);

      await figma.loadAllPagesAsync();

      var textNodes = [];
      function walk(node) {
        if (node.type === 'TEXT') textNodes.push(node);
        if (node.children) for (var i = 0; i < node.children.length; i++) walk(node.children[i]);
      }
      var pages = figma.root.children;
      for (var p = 0; p < pages.length; p++) walk(pages[p]);

      var updated = 0;
      var batchSize = 15;
      for (var i = 0; i < textNodes.length; i++) {
        var node = textNodes[i];
        try {
          await figma.loadFontAsync(node.fontName);
          node.characters = targetText;
          updated++;
        } catch (nodeErr) {
          console.warn('🌉 [Desktop Bridge] Skip text node ' + node.id + ':', nodeErr.message);
        }
        if ((i + 1) % batchSize === 0) {
          await new Promise(function(r) { setTimeout(r, 0); });
        }
      }

      console.log('🌉 [Desktop Bridge] Set text on ' + updated + ' of ' + textNodes.length + ' TEXT layers');

      figma.ui.postMessage({
        type: 'SET_ALL_TEXT_LAYERS_RESULT',
        requestId: msg.requestId,
        success: true,
        total: textNodes.length,
        updated: updated,
        text: targetText
      });
    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Set all text layers error:', errorMsg);
      figma.ui.postMessage({
        type: 'SET_ALL_TEXT_LAYERS_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // APPLY_HEADING_H2 - Apply Heading H2 (text style or variables) to all TEXT in a node
  // Replaces Body Small Medium / any current style so the token actually applies
  // ============================================================================
  else if (msg.type === 'APPLY_HEADING_H2') {
    try {
      var targetId = msg.nodeId || '4952:7160';
      console.log('🌉 [Desktop Bridge] Applying Heading H2 to node:', targetId);

      var root = await figma.getNodeByIdAsync(targetId);
      if (!root) {
        throw new Error('Node not found: ' + targetId);
      }

      var textNodes = [];
      function walk(n) {
        if (n.type === 'TEXT') textNodes.push(n);
        if (n.children) for (var i = 0; i < n.children.length; i++) walk(n.children[i]);
      }
      walk(root);

      var styles = await figma.getLocalTextStylesAsync();
      var headingH2Style = null;
      for (var s = 0; s < styles.length; s++) {
        var name = (styles[s].name || '').toLowerCase();
        if (name.indexOf('heading') !== -1 && name.indexOf('h2') !== -1) {
          headingH2Style = styles[s];
          break;
        }
        if (name === 'heading h2' || name === 'h2') {
          headingH2Style = styles[s];
          break;
        }
      }

      var applied = 0;
      var usedStyle = !!headingH2Style;

      for (var i = 0; i < textNodes.length; i++) {
        var tn = textNodes[i];
        try {
          await figma.loadFontAsync(tn.fontName);
          if (headingH2Style) {
            await tn.setTextStyleIdAsync(headingH2Style.id);
            applied++;
          } else {
            var fontSizeVar = await figma.variables.getVariableByIdAsync('VariableID:713:5071');
            var fontFamilyVar = await figma.variables.getVariableByIdAsync('VariableID:709:17207');
            var lineHeightVar = await figma.variables.getVariableByIdAsync('VariableID:713:5085');
            var weightVar = await figma.variables.getVariableByIdAsync('VariableID:713:5068');
            if (fontSizeVar) {
              tn.setBoundVariable('fontSize', fontSizeVar);
              if (lineHeightVar) try { tn.setBoundVariable('lineHeight', lineHeightVar); } catch (e) {}
              if (fontFamilyVar) try { tn.setBoundVariable('fontFamily', fontFamilyVar); } catch (e) {}
              if (weightVar) try { tn.setBoundVariable('fontWeight', weightVar); } catch (e) {}
              applied++;
            }
          }
        } catch (err) {
          console.warn('🌉 [Desktop Bridge] Skip text node ' + tn.id + ':', err.message);
        }
      }

      console.log('🌉 [Desktop Bridge] Heading H2 applied to ' + applied + ' of ' + textNodes.length + ' (used TextStyle: ' + usedStyle + ')');

      figma.ui.postMessage({
        type: 'APPLY_HEADING_H2_RESULT',
        requestId: msg.requestId,
        success: true,
        total: textNodes.length,
        applied: applied,
        usedTextStyle: usedStyle,
        styleName: headingH2Style ? headingH2Style.name : null
      });
    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Apply Heading H2 error:', errorMsg);
      figma.ui.postMessage({
        type: 'APPLY_HEADING_H2_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // SET_TEXT_CONTENT - Set text on a text node
  // ============================================================================
  else if (msg.type === 'SET_TEXT_CONTENT') {
    try {
      console.log('🌉 [Desktop Bridge] Setting text content on node:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (node.type !== 'TEXT') {
        throw new Error('Node must be a TEXT node. Got: ' + node.type);
      }

      // Load the font first
      await figma.loadFontAsync(node.fontName);

      node.characters = msg.text;

      // Apply font properties if specified
      if (msg.fontSize) {
        node.fontSize = msg.fontSize;
      }

      console.log('🌉 [Desktop Bridge] Text content set');

      figma.ui.postMessage({
        type: 'SET_TEXT_CONTENT_RESULT',
        requestId: msg.requestId,
        success: true,
        node: { id: node.id, name: node.name, characters: node.characters }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Set text content error:', errorMsg);
      figma.ui.postMessage({
        type: 'SET_TEXT_CONTENT_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // CREATE_CHILD_NODE - Create a new child node
  // ============================================================================
  else if (msg.type === 'CREATE_CHILD_NODE') {
    try {
      console.log('🌉 [Desktop Bridge] Creating child node of type:', msg.nodeType);

      var parent = await figma.getNodeByIdAsync(msg.parentId);
      if (!parent) {
        throw new Error('Parent node not found: ' + msg.parentId);
      }

      if (!('appendChild' in parent)) {
        throw new Error('Parent node type ' + parent.type + ' does not support children');
      }

      var newNode;
      var props = msg.properties || {};

      switch (msg.nodeType) {
        case 'RECTANGLE':
          newNode = figma.createRectangle();
          break;
        case 'ELLIPSE':
          newNode = figma.createEllipse();
          break;
        case 'FRAME':
          newNode = figma.createFrame();
          break;
        case 'TEXT':
          newNode = figma.createText();
          // Load default font
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          newNode.fontName = { family: 'Inter', style: 'Regular' };
          if (props.text) {
            newNode.characters = props.text;
          }
          break;
        case 'LINE':
          newNode = figma.createLine();
          break;
        case 'POLYGON':
          newNode = figma.createPolygon();
          break;
        case 'STAR':
          newNode = figma.createStar();
          break;
        case 'VECTOR':
          newNode = figma.createVector();
          break;
        default:
          throw new Error('Unsupported node type: ' + msg.nodeType);
      }

      // Apply common properties
      if (props.name) newNode.name = props.name;
      if (props.x !== undefined) newNode.x = props.x;
      if (props.y !== undefined) newNode.y = props.y;
      if (props.width !== undefined && props.height !== undefined) {
        newNode.resize(props.width, props.height);
      }

      // Apply fills if specified
      if (props.fills) {
        var processedFills = props.fills.map(function(fill) {
          if (fill.type === 'SOLID' && typeof fill.color === 'string') {
            var rgb = hexToFigmaRGB(fill.color);
            return {
              type: 'SOLID',
              color: { r: rgb.r, g: rgb.g, b: rgb.b },
              opacity: rgb.a !== undefined ? rgb.a : 1
            };
          }
          return fill;
        });
        newNode.fills = processedFills;
      }

      // Add to parent
      parent.appendChild(newNode);

      console.log('🌉 [Desktop Bridge] Child node created:', newNode.id);

      figma.ui.postMessage({
        type: 'CREATE_CHILD_NODE_RESULT',
        requestId: msg.requestId,
        success: true,
        node: {
          id: newNode.id,
          name: newNode.name,
          type: newNode.type,
          x: newNode.x,
          y: newNode.y,
          width: newNode.width,
          height: newNode.height
        }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Create child node error:', errorMsg);
      figma.ui.postMessage({
        type: 'CREATE_CHILD_NODE_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // CAPTURE_SCREENSHOT - Capture node screenshot using plugin exportAsync
  // This captures the CURRENT plugin runtime state (not cloud state like REST API)
  // ============================================================================
  else if (msg.type === 'CAPTURE_SCREENSHOT') {
    try {
      console.log('🌉 [Desktop Bridge] Capturing screenshot for node:', msg.nodeId);

      var node = msg.nodeId ? await figma.getNodeByIdAsync(msg.nodeId) : figma.currentPage;
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      // Verify node supports export
      if (!('exportAsync' in node)) {
        throw new Error('Node type ' + node.type + ' does not support export');
      }

      // Configure export settings
      var format = msg.format || 'PNG';
      var scale = msg.scale || 2;

      var exportSettings = {
        format: format,
        constraint: { type: 'SCALE', value: scale }
      };

      // Export the node
      var bytes = await node.exportAsync(exportSettings);

      // Convert to base64
      var base64 = figma.base64Encode(bytes);

      // Get node bounds for context
      var bounds = null;
      if ('absoluteBoundingBox' in node) {
        bounds = node.absoluteBoundingBox;
      }

      console.log('🌉 [Desktop Bridge] Screenshot captured:', bytes.length, 'bytes');

      figma.ui.postMessage({
        type: 'CAPTURE_SCREENSHOT_RESULT',
        requestId: msg.requestId,
        success: true,
        image: {
          base64: base64,
          format: format,
          scale: scale,
          byteLength: bytes.length,
          node: {
            id: node.id,
            name: node.name,
            type: node.type
          },
          bounds: bounds
        }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Screenshot capture error:', errorMsg);
      figma.ui.postMessage({
        type: 'CAPTURE_SCREENSHOT_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // GET_FILE_INFO - Report which file this plugin instance is running in
  // Used by WebSocket bridge to identify the connected file
  // ============================================================================
  else if (msg.type === 'GET_FILE_INFO') {
    try {
      figma.ui.postMessage({
        type: 'GET_FILE_INFO_RESULT',
        requestId: msg.requestId,
        success: true,
        fileInfo: {
          fileName: figma.root.name,
          fileKey: figma.fileKey || null,
          currentPage: figma.currentPage.name
        }
      });
    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      figma.ui.postMessage({
        type: 'GET_FILE_INFO_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // UNDO_ACTION - Revert a previous action (rename back, delete created node, etc.)
  // ============================================================================
  else if (msg.type === 'UNDO_ACTION') {
    try {
      var actionType = msg.actionType;
      var nodeId = msg.nodeId;
      var newName = msg.newName;

      if (actionType === 'RENAME_NODE' && nodeId && newName != null) {
        var node = await figma.getNodeByIdAsync(nodeId);
        if (!node) {
          throw new Error('Node not found: ' + nodeId);
        }
        node.name = newName;
        figma.ui.postMessage({
          type: 'UNDO_ACTION_RESULT',
          requestId: msg.requestId,
          success: true
        });
      } else if (actionType === 'DELETE_NODE' && nodeId) {
        var nodeToDelete = await figma.getNodeByIdAsync(nodeId);
        if (!nodeToDelete) {
          throw new Error('Node not found: ' + nodeId);
        }
        nodeToDelete.remove();
        figma.ui.postMessage({
          type: 'UNDO_ACTION_RESULT',
          requestId: msg.requestId,
          success: true
        });
      } else {
        throw new Error('Undo not supported for: ' + actionType);
      }
    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      figma.ui.postMessage({
        type: 'UNDO_ACTION_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // RELOAD_UI - Reload the plugin UI iframe (re-establishes WebSocket connection)
  // Uses figma.showUI(__html__) to reload without restarting code.js
  // ============================================================================
  else if (msg.type === 'RELOAD_UI') {
    try {
      console.log('🌉 [Desktop Bridge] Reloading plugin UI');
      figma.ui.postMessage({
        type: 'RELOAD_UI_RESULT',
        requestId: msg.requestId,
        success: true
      });
      // Short delay to let the response message be sent before reload
      setTimeout(function() {
        figma.showUI(__html__, { width: 280, height: 380, visible: true, themeColors: true });
      }, 100);
    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      figma.ui.postMessage({
        type: 'RELOAD_UI_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // SET_INSTANCE_PROPERTIES - Update component properties on an instance
  // Uses instance.setProperties() to update TEXT, BOOLEAN, INSTANCE_SWAP, VARIANT
  // ============================================================================
  else if (msg.type === 'SET_INSTANCE_PROPERTIES') {
    try {
      console.log('🌉 [Desktop Bridge] Setting instance properties on:', msg.nodeId);

      var node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) {
        throw new Error('Node not found: ' + msg.nodeId);
      }

      if (node.type !== 'INSTANCE') {
        throw new Error('Node must be an INSTANCE. Got: ' + node.type);
      }

      // Load main component first (required for documentAccess: dynamic-page)
      var mainComponent = await node.getMainComponentAsync();

      // Get current properties for reference
      var currentProps = node.componentProperties;
      console.log('🌉 [Desktop Bridge] Current properties:', JSON.stringify(Object.keys(currentProps)));

      // Build the properties object
      // Note: TEXT, BOOLEAN, INSTANCE_SWAP properties use the format "PropertyName#nodeId"
      // VARIANT properties use just "PropertyName"
      var propsToSet = {};
      var propUpdates = msg.properties || {};

      for (var propName in propUpdates) {
        var newValue = propUpdates[propName];

        // Check if this exact property name exists
        if (currentProps[propName] !== undefined) {
          propsToSet[propName] = newValue;
          console.log('🌉 [Desktop Bridge] Setting property:', propName, '=', newValue);
        } else {
          // Try to find a matching property with a suffix (for TEXT/BOOLEAN/INSTANCE_SWAP)
          var foundMatch = false;
          for (var existingProp in currentProps) {
            // Check if this is the base property name with a node ID suffix
            if (existingProp.startsWith(propName + '#')) {
              propsToSet[existingProp] = newValue;
              console.log('🌉 [Desktop Bridge] Found suffixed property:', existingProp, '=', newValue);
              foundMatch = true;
              break;
            }
          }

          if (!foundMatch) {
            console.warn('🌉 [Desktop Bridge] Property not found:', propName, '- Available:', Object.keys(currentProps).join(', '));
          }
        }
      }

      if (Object.keys(propsToSet).length === 0) {
        throw new Error('No valid properties to set. Available properties: ' + Object.keys(currentProps).join(', '));
      }

      // Apply the properties
      node.setProperties(propsToSet);

      // Get updated properties
      var updatedProps = node.componentProperties;

      console.log('🌉 [Desktop Bridge] Instance properties updated');

      figma.ui.postMessage({
        type: 'SET_INSTANCE_PROPERTIES_RESULT',
        requestId: msg.requestId,
        success: true,
        instance: {
          id: node.id,
          name: node.name,
          componentId: mainComponent ? mainComponent.id : null,
          propertiesSet: Object.keys(propsToSet),
          currentProperties: Object.keys(updatedProps).reduce(function(acc, key) {
            acc[key] = {
              type: updatedProps[key].type,
              value: updatedProps[key].value
            };
            return acc;
          }, {})
        }
      });

    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Set instance properties error:', errorMsg);
      figma.ui.postMessage({
        type: 'SET_INSTANCE_PROPERTIES_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg
      });
    }
  }

  // ============================================================================
  // SET_AUTO_LAYOUT - Enable Auto Layout on a frame
  // ============================================================================
  else if (msg.type === 'SET_AUTO_LAYOUT') {
    try {
      var node = getNode(msg.nodeId);
      assertType(node, ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);
      node.layoutMode = msg.direction;
      if (msg.padding) {
        if (typeof msg.padding.top === 'number') node.paddingTop = msg.padding.top;
        if (typeof msg.padding.right === 'number') node.paddingRight = msg.padding.right;
        if (typeof msg.padding.bottom === 'number') node.paddingBottom = msg.padding.bottom;
        if (typeof msg.padding.left === 'number') node.paddingLeft = msg.padding.left;
      }
      if (typeof msg.itemSpacing === 'number') node.itemSpacing = msg.itemSpacing;
      if (msg.alignment) {
        if (msg.alignment === 'SPACE_BETWEEN') node.primaryAxisAlignItems = 'SPACE_BETWEEN';
        else if (msg.alignment === 'MIN') node.primaryAxisAlignItems = 'MIN';
        else if (msg.alignment === 'CENTER') node.primaryAxisAlignItems = 'CENTER';
        else if (msg.alignment === 'MAX') node.primaryAxisAlignItems = 'MAX';
      }
      if (typeof msg.wrap === 'boolean') node.layoutWrap = msg.wrap ? 'WRAP' : 'NO_WRAP';
      if (typeof msg.clipContent === 'boolean') node.clipsContent = msg.clipContent;
      ok(msg.type, msg.requestId);
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'UPDATE_AUTO_LAYOUT') {
    try {
      var node = getNode(msg.nodeId);
      assertType(node, ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);
      if (msg.padding) {
        if (typeof msg.padding.top === 'number') node.paddingTop = msg.padding.top;
        if (typeof msg.padding.right === 'number') node.paddingRight = msg.padding.right;
        if (typeof msg.padding.bottom === 'number') node.paddingBottom = msg.padding.bottom;
        if (typeof msg.padding.left === 'number') node.paddingLeft = msg.padding.left;
      }
      if (typeof msg.itemSpacing === 'number') node.itemSpacing = msg.itemSpacing;
      if (msg.alignment) {
        if (msg.alignment === 'SPACE_BETWEEN') node.primaryAxisAlignItems = 'SPACE_BETWEEN';
        else if (msg.alignment === 'MIN') node.primaryAxisAlignItems = 'MIN';
        else if (msg.alignment === 'CENTER') node.primaryAxisAlignItems = 'CENTER';
        else if (msg.alignment === 'MAX') node.primaryAxisAlignItems = 'MAX';
      }
      if (typeof msg.wrap === 'boolean') node.layoutWrap = msg.wrap ? 'WRAP' : 'NO_WRAP';
      if (typeof msg.clipContent === 'boolean') node.clipsContent = msg.clipContent;
      ok(msg.type, msg.requestId);
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'REMOVE_AUTO_LAYOUT') {
    try {
      var node = getNode(msg.nodeId);
      assertType(node, ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);
      node.layoutMode = 'NONE';
      ok(msg.type, msg.requestId);
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'SET_LAYOUT_SIZING') {
    try {
      var node = getNode(msg.nodeId);
      if (msg.width && 'layoutSizingHorizontal' in node) {
        node.layoutSizingHorizontal = msg.width;
        if (msg.width === 'FIXED' && typeof msg.fixedWidth === 'number') node.resize(msg.fixedWidth, node.height);
      }
      if (msg.height && 'layoutSizingVertical' in node) {
        node.layoutSizingVertical = msg.height;
        if (msg.height === 'FIXED' && typeof msg.fixedHeight === 'number') node.resize(node.width, msg.fixedHeight);
      }
      ok(msg.type, msg.requestId);
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'SET_LAYOUT_ALIGN') {
    try {
      var node = getNode(msg.nodeId);
      if (msg.align && 'counterAxisAlignItems' in node) node.counterAxisAlignItems = msg.align;
      ok(msg.type, msg.requestId);
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'SET_PADDING') {
    try {
      var node = getNode(msg.nodeId);
      var p = msg.padding;
      if (p && typeof p.top === 'number') node.paddingTop = p.top;
      if (p && typeof p.right === 'number') node.paddingRight = p.right;
      if (p && typeof p.bottom === 'number') node.paddingBottom = p.bottom;
      if (p && typeof p.left === 'number') node.paddingLeft = p.left;
      ok(msg.type, msg.requestId);
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'SET_ITEM_SPACING') {
    try {
      var node = getNode(msg.nodeId);
      if (typeof msg.itemSpacing === 'number') node.itemSpacing = msg.itemSpacing;
      ok(msg.type, msg.requestId);
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'SET_WRAP') {
    try {
      var node = getNode(msg.nodeId);
      if (typeof msg.wrap === 'boolean') node.layoutWrap = msg.wrap ? 'WRAP' : 'NO_WRAP';
      ok(msg.type, msg.requestId);
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'SET_CLIP_CONTENT') {
    try {
      var node = getNode(msg.nodeId);
      if (typeof msg.clipContent === 'boolean') node.clipsContent = msg.clipContent;
      ok(msg.type, msg.requestId);
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'SET_SCROLL_BEHAVIOR') {
    try {
      var node = getNode(msg.nodeId);
      var s = msg.scroll;
      if (s === 'NONE') node.overflowDirection = 'NONE';
      else if (s === 'HORIZONTAL') node.overflowDirection = 'HORIZONTAL_SCROLLING';
      else if (s === 'VERTICAL') node.overflowDirection = 'VERTICAL_SCROLLING';
      else if (s === 'BOTH') node.overflowDirection = 'BOTH_SCROLLING';
      if (typeof msg.clipContent === 'boolean') node.clipsContent = msg.clipContent;
      ok(msg.type, msg.requestId);
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'SET_COMPONENT_STATE') {
    try {
      var node = getNode(msg.instanceNodeId);
      assertType(node, ['INSTANCE']);
      if (!msg.properties || typeof msg.properties !== 'object') throw new Error('properties must be an object');
      if (typeof node.setProperties === 'function') {
        node.setProperties(msg.properties);
      } else {
        fail(msg.type, msg.requestId, new Error('setProperties not available on this instance'));
        return;
      }
      ok(msg.type, msg.requestId);
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'CREATE_INTERACTION' || msg.type === 'UPDATE_INTERACTION' || msg.type === 'DELETE_INTERACTION' || msg.type === 'LINK_VARIANTS_AS_INTERACTIVE') {
    try { fail(msg.type, msg.requestId, new Error('Not implemented')); } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'GET_VARIABLES') {
    try {
      var variables = await figma.variables.getLocalVariablesAsync();
      var collections = await figma.variables.getLocalVariableCollectionsAsync();
      var includeValues = msg.includeValues !== false;
      var out = { variables: variables.map(function(v) { return serializeVariable(v); }), collections: collections.map(function(c) { return serializeCollection(c); }), includeValues: includeValues };
      ok(msg.type, msg.requestId, { data: out });
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'GET_COLLECTIONS') {
    try {
      var collections = await figma.variables.getLocalVariableCollectionsAsync();
      ok(msg.type, msg.requestId, { data: { collections: collections.map(function(c) { return serializeCollection(c); }) } });
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'FIND_VARIABLE') {
    try {
      var variables = await figma.variables.getLocalVariablesAsync();
      var collections = await figma.variables.getLocalVariableCollectionsAsync();
      var name = (msg.name || '').trim();
      var list = [];
      for (var i = 0; i < variables.length; i++) {
        var v = variables[i];
        if (v.name !== name) continue;
        var coll = null;
        if (msg.collectionName) {
          coll = collections.find(function(c) { return c.name === msg.collectionName; });
          if (!coll || coll.id !== v.variableCollectionId) continue;
        }
        if (msg.modeName && coll && coll.modes) {
          var hasMode = coll.modes.some(function(m) { return m.name === msg.modeName; });
          if (!hasMode) continue;
        }
        list.push({ variableId: v.id, name: v.name, key: v.key, variableCollectionId: v.variableCollectionId });
      }
      ok(msg.type, msg.requestId, { data: { variables: list } });
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'GET_VARIABLE_BY_NAME') {
    try {
      var variables = await figma.variables.getLocalVariablesAsync();
      var collections = await figma.variables.getLocalVariableCollectionsAsync();
      var name = (msg.name || '').trim();
      var v = null;
      if (msg.collectionName) {
        var coll = collections.find(function(c) { return c.name === msg.collectionName; });
        v = coll ? variables.find(function(x) { return x.name === name && x.variableCollectionId === coll.id; }) : null;
      } else {
        v = variables.find(function(x) { return x.name === name; });
      }
      if (!v) { fail(msg.type, msg.requestId, new Error('Variable not found: ' + name)); return; }
      ok(msg.type, msg.requestId, { data: { variableId: v.id, variable: serializeVariable(v) } });
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'GET_VARIABLE_BY_ID') {
    try {
      var v = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!v) { fail(msg.type, msg.requestId, new Error('Variable not found: ' + msg.variableId)); return; }
      ok(msg.type, msg.requestId, { data: { variable: serializeVariable(v) } });
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  // ============================================================================
  // SCAN_BROKEN_BINDINGS - Find fills/strokes bound to a variable that no longer exists
  // ============================================================================
  else if (msg.type === 'SCAN_BROKEN_BINDINGS') {
    try {
      var rootId = msg.nodeId || (figma.currentPage && figma.currentPage.id);
      if (!rootId) {
        throw new Error('No nodeId and no current page');
      }
      var root = await figma.getNodeByIdAsync(rootId);
      if (!root) {
        throw new Error('Node not found: ' + rootId);
      }
      var candidates = [];
      function walkCollect(node) {
        if (!node) return;
        if ('fills' in node && node.fills && node.fills.length > 0) {
          var f = node.fills[0];
          var alias = f.boundVariables && f.boundVariables.color;
          if (alias && alias.id) candidates.push({ nodeId: node.id, name: node.name, variableId: alias.id, property: 'fill' });
        }
        if ('strokes' in node && node.strokes && node.strokes.length > 0) {
          for (var s = 0; s < node.strokes.length; s++) {
            var st = node.strokes[s];
            var strokeAlias = st.boundVariables && st.boundVariables.color;
            if (strokeAlias && strokeAlias.id) candidates.push({ nodeId: node.id, name: node.name, variableId: strokeAlias.id, property: 'stroke', strokeIndex: s });
          }
        }
        if (node.children) {
          for (var i = 0; i < node.children.length; i++) walkCollect(node.children[i]);
        }
      }
      walkCollect(root);
      var verifiedBroken = [];
      for (var b = 0; b < candidates.length; b++) {
        var it = candidates[b];
        try {
          var v = await figma.variables.getVariableByIdAsync(it.variableId);
          if (!v) {
            verifiedBroken.push(it);
          }
        } catch (e) {
          verifiedBroken.push({ nodeId: it.nodeId, name: it.name, variableId: it.variableId, property: it.property, error: e.message });
        }
      }
      figma.ui.postMessage({
        type: 'SCAN_BROKEN_BINDINGS_RESULT',
        requestId: msg.requestId,
        success: true,
        broken: verifiedBroken,
        count: verifiedBroken.length
      });
    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Scan broken bindings error:', errorMsg);
      figma.ui.postMessage({
        type: 'SCAN_BROKEN_BINDINGS_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg,
        broken: [],
        count: 0
      });
    }
  }

  // ============================================================================
  // REPAIR_BROKEN_BINDINGS - Replace broken variable references with solid fallback or with a variable (if variableId provided)
  // ============================================================================
  else if (msg.type === 'REPAIR_BROKEN_BINDINGS') {
    try {
      var rootId = msg.nodeId || (figma.currentPage && figma.currentPage.id);
      if (!rootId) {
        throw new Error('No nodeId and no current page');
      }
      var root = await figma.getNodeByIdAsync(rootId);
      if (!root) {
        throw new Error('Node not found: ' + rootId);
      }
      var useVariableId = msg.variableId && typeof msg.variableId === 'string';
      var replaceVariable = null;
      if (useVariableId) {
        replaceVariable = await figma.variables.getVariableByIdAsync(msg.variableId);
        if (!replaceVariable || replaceVariable.resolvedType !== 'COLOR') {
          throw new Error('Variable not found or not a color variable: ' + msg.variableId);
        }
      }
      var fallbackHex = (msg.fallbackHex && typeof msg.fallbackHex === 'string') ? msg.fallbackHex.replace(/^#/, '').toUpperCase() : '6B7280';
      if (fallbackHex.length === 6) fallbackHex = '#' + fallbackHex; else fallbackHex = '#6B7280';
      var fallbackR = parseInt(fallbackHex.slice(1, 3), 16) / 255;
      var fallbackG = parseInt(fallbackHex.slice(3, 5), 16) / 255;
      var fallbackB = parseInt(fallbackHex.slice(5, 7), 16) / 255;
      var candidates = [];
      function walkCollect(node) {
        if (!node) return;
        if ('fills' in node && node.fills && node.fills.length > 0) {
          var f = node.fills[0];
          var alias = f.boundVariables && f.boundVariables.color;
          if (alias && alias.id) candidates.push({ nodeId: node.id, name: node.name, variableId: alias.id, property: 'fill', strokeIndex: null });
        }
        if ('strokes' in node && node.strokes && node.strokes.length > 0) {
          for (var s = 0; s < node.strokes.length; s++) {
            var st = node.strokes[s];
            var strokeAlias = st.boundVariables && st.boundVariables.color;
            if (strokeAlias && strokeAlias.id) candidates.push({ nodeId: node.id, name: node.name, variableId: strokeAlias.id, property: 'stroke', strokeIndex: s });
          }
        }
        if (node.children) for (var k = 0; k < node.children.length; k++) walkCollect(node.children[k]);
      }
      walkCollect(root);
      var brokenList = [];
      for (var b = 0; b < candidates.length; b++) {
        var it = candidates[b];
        try {
          var v = await figma.variables.getVariableByIdAsync(it.variableId);
          if (!v) brokenList.push(it);
        } catch (e) {
          brokenList.push(it);
        }
      }
      var repaired = [];
      var notFound = [];
      for (var r = 0; r < brokenList.length; r++) {
        var it = brokenList[r];
        var n = await figma.getNodeByIdAsync(it.nodeId);
        if (!n) { notFound.push(it); continue; }
        try {
          if (it.property === 'fill' && 'fills' in n && n.fills && n.fills.length > 0) {
            var fillsCopy = JSON.parse(JSON.stringify(n.fills));
            if (replaceVariable) {
              fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', replaceVariable);
            } else {
              fillsCopy[0] = { type: 'SOLID', color: { r: fallbackR, g: fallbackG, b: fallbackB }, opacity: 1 };
            }
            n.fills = fillsCopy;
            repaired.push({ nodeId: it.nodeId, name: it.name, property: 'fill', action: 'replaced', fallbackHex: replaceVariable ? undefined : fallbackHex, variableId: replaceVariable ? replaceVariable.id : undefined });
          } else if (it.property === 'stroke' && 'strokes' in n && n.strokes) {
            var idx = it.strokeIndex != null ? it.strokeIndex : 0;
            var strokesCopy = JSON.parse(JSON.stringify(n.strokes));
            if (replaceVariable) {
              strokesCopy[idx] = figma.variables.setBoundVariableForPaint(strokesCopy[idx], 'color', replaceVariable);
            } else {
              strokesCopy[idx] = { type: 'SOLID', color: { r: fallbackR, g: fallbackG, b: fallbackB }, opacity: 1 };
            }
            n.strokes = strokesCopy;
            repaired.push({ nodeId: it.nodeId, name: it.name, property: 'stroke', action: 'replaced', fallbackHex: replaceVariable ? undefined : fallbackHex, variableId: replaceVariable ? replaceVariable.id : undefined });
          } else {
            notFound.push(it);
          }
        } catch (e) {
          notFound.push({ nodeId: it.nodeId, name: it.name, variableId: it.variableId, property: it.property, error: e.message });
        }
      }
      figma.ui.postMessage({
        type: 'REPAIR_BROKEN_BINDINGS_RESULT',
        requestId: msg.requestId,
        success: true,
        repaired: repaired,
        notFound: notFound,
        count: repaired.length
      });
    } catch (error) {
      var errorMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Repair broken bindings error:', errorMsg);
      figma.ui.postMessage({
        type: 'REPAIR_BROKEN_BINDINGS_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errorMsg,
        repaired: [],
        notFound: []
      });
    }
  }

  // ============================================================================
  // FIX_BROKEN_TOKENS - Detect and fix variable tokens that reference deleted variables
  // Scope: page | selection | node | global. dryRun: only report, do not apply.
  // Resolves replacement by semantic → primitive → fuzzy (same priority as token integrity).
  // ============================================================================
  else if (msg.type === 'FIX_BROKEN_TOKENS') {
    try {
      var scope = (msg.scope && String(msg.scope).toLowerCase()) || 'page';
      var nodeId = msg.nodeId && String(msg.nodeId).trim() ? msg.nodeId : null;
      var dryRun = msg.dryRun === true;

      var roots = [];
      if (scope === 'node' && nodeId) {
        var one = await figma.getNodeByIdAsync(nodeId);
        if (!one) throw new Error('Node not found: ' + nodeId);
        roots.push(one);
      } else if (scope === 'selection') {
        var sel = figma.currentPage.selection;
        if (sel && sel.length > 0) {
          for (var si = 0; si < sel.length; si++) roots.push(sel[si]);
        } else if (figma.currentPage) {
          roots.push(figma.currentPage);
        }
        if (roots.length === 0) throw new Error('No selection and no current page.');
      } else if (scope === 'page') {
        if (figma.currentPage) roots.push(figma.currentPage);
        if (roots.length === 0) throw new Error('No current page.');
      } else if (scope === 'global') {
        var pages = figma.root.children;
        for (var pi = 0; pi < pages.length; pi++) roots.push(pages[pi]);
        if (roots.length === 0) throw new Error('No pages in document.');
      } else {
        throw new Error('Invalid scope. Use: page, selection, node, or global.');
      }

      var variables = await figma.variables.getLocalVariablesAsync();
      var collections = await figma.variables.getLocalVariableCollectionsAsync();
      var activeVariableIds = {};
      for (var vi = 0; vi < variables.length; vi++) activeVariableIds[variables[vi].id] = true;

      function traverseAll(node) {
        var list = [node];
        if (node.children && node.children.length > 0) {
          for (var c = 0; c < node.children.length; c++) {
            list = list.concat(traverseAll(node.children[c]));
          }
        }
        return list;
      }

      var allNodes = [];
      for (var ri = 0; ri < roots.length; ri++) allNodes = allNodes.concat(traverseAll(roots[ri]));
      var reportScanned = allNodes.length;

      function normalizeHex(hexStr) {
        if (!hexStr || typeof hexStr !== 'string') return '';
        var h = hexStr.replace(/^#/, '').trim().toUpperCase();
        if (h.length === 8) h = h.substring(0, 6);
        return h.length === 6 ? h : '';
      }
      function rgbToHex(r, g, b) {
        return [r, g, b].map(function(x) {
          var n = Math.round(Math.max(0, Math.min(1, x)) * 255);
          var h = n.toString(16);
          return h.length === 1 ? '0' + h : h;
        }).join('').toUpperCase();
      }

      var brokenList = [];
      for (var ni = 0; ni < allNodes.length; ni++) {
        var node = allNodes[ni];
        if ('fills' in node && node.fills && node.fills.length > 0) {
          var f = node.fills[0];
          var alias = f.boundVariables && f.boundVariables.color;
          if (alias && alias.id && !activeVariableIds[alias.id]) {
            var r = (f.type === 'SOLID' && f.color) ? f.color.r : 0;
            var g = (f.type === 'SOLID' && f.color) ? f.color.g : 0;
            var b = (f.type === 'SOLID' && f.color) ? f.color.b : 0;
            brokenList.push({
              nodeId: node.id,
              nodeName: node.name,
              variableId: alias.id,
              property: 'fill',
              strokeIndex: null,
              resolvedHex: rgbToHex(r, g, b),
              role: node.type === 'TEXT' ? 'text' : 'fill'
            });
          }
        }
        if ('strokes' in node && node.strokes && node.strokes.length > 0) {
          for (var s = 0; s < node.strokes.length; s++) {
            var st = node.strokes[s];
            var strokeAlias = st.boundVariables && st.boundVariables.color;
            if (strokeAlias && strokeAlias.id && !activeVariableIds[strokeAlias.id]) {
              var sr = (st.type === 'SOLID' && st.color) ? st.color.r : 0;
              var sg = (st.type === 'SOLID' && st.color) ? st.color.g : 0;
              var sb = (st.type === 'SOLID' && st.color) ? st.color.b : 0;
              brokenList.push({
                nodeId: node.id,
                nodeName: node.name,
                variableId: strokeAlias.id,
                property: 'stroke',
                strokeIndex: s,
                resolvedHex: rgbToHex(sr, sg, sb),
                role: 'stroke'
              });
            }
          }
        }
      }

      var defaultMap = {
        color: { light: { color: {
          background: { neutral: { base: { $type: 'color', $value: '#FCFCFD' } } },
          icon: { inverse: { $type: 'color', $value: '#FFFFFF' } },
          text: { primary: { $type: 'color', $value: '#1C2024' }, secondary: { $type: 'color', $value: '#6B7280' }, disabled: { $type: 'color', $value: '#9CA3AF' } },
          border: { default: { $type: 'color', $value: '#E5E7EB' } }
        } } }
      };
      var hexToPath = {};
      var hexToPaths = {};
      function collectPaths(obj, prefix) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.$type === 'color' && obj.$value) {
          var hex = normalizeHex(obj.$value);
          if (hex) {
            var p = prefix || '';
            if (!hexToPath[hex]) hexToPath[hex] = p;
            if (!hexToPaths[hex]) hexToPaths[hex] = [];
            if (hexToPaths[hex].indexOf(p) === -1) hexToPaths[hex].push(p);
          }
        }
        for (var key in obj) {
          if (obj.hasOwnProperty(key) && key !== '$type' && key !== '$value' && key !== '$description') {
            var next = prefix ? prefix + '/' + key : key;
            collectPaths(obj[key], next);
          }
        }
      }
      collectPaths(defaultMap, '');
      function pickPathForRole(hex, role) {
        var paths = hexToPaths[hex];
        if (!paths || paths.length === 0) return hexToPath[hex];
        if (role === 'text') {
          for (var i = 0; i < paths.length; i++) if (paths[i].toLowerCase().indexOf('text') !== -1) return paths[i];
        }
        if (role === 'stroke') {
          for (var j = 0; j < paths.length; j++) {
            var lower = paths[j].toLowerCase();
            if (lower.indexOf('border') !== -1 || lower.indexOf('stroke') !== -1) return paths[j];
          }
        }
        return hexToPath[hex] || (paths && paths[0]);
      }
      function normalizePath(name) {
        if (!name || typeof name !== 'string') return '';
        return name.replace(/\./g, '/').replace(/\\/g, '/').toLowerCase();
      }
      var pathToVariable = {};
      for (var vj = 0; vj < variables.length; vj++) {
        var vv = variables[vj];
        if (vv.resolvedType !== 'COLOR') continue;
        var key = normalizePath(vv.name);
        if (key && !pathToVariable[key]) pathToVariable[key] = vv;
      }

      var reportFixed = 0;
      var reportFailed = [];
      var reportDetails = [];

      for (var bi = 0; bi < brokenList.length; bi++) {
        var it = brokenList[bi];
        var tokenDesc = it.property + (it.strokeIndex != null ? '[' + it.strokeIndex + ']' : '') + ' → ' + it.variableId;
        reportDetails.push({
          nodeId: it.nodeId,
          nodeName: it.nodeName,
          token: tokenDesc,
          status: dryRun ? 'detected' : 'pending'
        });

        if (dryRun) continue;

        var hex = normalizeHex(it.resolvedHex || '');
        var path = pickPathForRole(hex, it.role);
        if (!path) {
          reportFailed.push({ nodeId: it.nodeId, nodeName: it.nodeName, reason: 'no token path for hex #' + hex });
          reportDetails[reportDetails.length - 1].status = 'failed';
          continue;
        }
        var pathKey = normalizePath(path);
        var variable = pathToVariable[pathKey];
        if (!variable) {
          reportFailed.push({ nodeId: it.nodeId, nodeName: it.nodeName, reason: 'no variable for path ' + path });
          reportDetails[reportDetails.length - 1].status = 'failed';
          continue;
        }

        var targetNode = await figma.getNodeByIdAsync(it.nodeId);
        if (!targetNode) {
          reportFailed.push({ nodeId: it.nodeId, nodeName: it.nodeName, reason: 'node not found' });
          reportDetails[reportDetails.length - 1].status = 'failed';
          continue;
        }
        try {
          var variableRef = await figma.variables.getVariableByIdAsync(variable.id);
          if (!variableRef || variableRef.resolvedType !== 'COLOR') {
            reportFailed.push({ nodeId: it.nodeId, nodeName: it.nodeName, reason: 'variable not color: ' + path });
            reportDetails[reportDetails.length - 1].status = 'failed';
            continue;
          }
          if (it.property === 'fill' && 'fills' in targetNode && targetNode.fills && targetNode.fills.length > 0) {
            var fillsCopy = JSON.parse(JSON.stringify(targetNode.fills));
            fillsCopy[0] = fillsCopy[0].type === 'SOLID' ? figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', variableRef) : figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }, 'color', variableRef);
            targetNode.fills = fillsCopy;
            if ('fillStyleId' in targetNode && targetNode.fillStyleId) targetNode.fillStyleId = '';
            reportFixed++;
            reportDetails[reportDetails.length - 1].status = 'fixed';
          } else if (it.property === 'stroke' && 'strokes' in targetNode && targetNode.strokes) {
            var idx = it.strokeIndex != null ? it.strokeIndex : 0;
            var strokesCopy = JSON.parse(JSON.stringify(targetNode.strokes));
            strokesCopy[idx] = figma.variables.setBoundVariableForPaint(strokesCopy[idx], 'color', variableRef);
            targetNode.strokes = strokesCopy;
            if ('strokeStyleId' in targetNode && targetNode.strokeStyleId) targetNode.strokeStyleId = '';
            reportFixed++;
            reportDetails[reportDetails.length - 1].status = 'fixed';
          } else {
            reportFailed.push({ nodeId: it.nodeId, nodeName: it.nodeName, reason: 'could not apply' });
            reportDetails[reportDetails.length - 1].status = 'failed';
          }
        } catch (e) {
          reportFailed.push({ nodeId: it.nodeId, nodeName: it.nodeName, reason: e.message || String(e) });
          reportDetails[reportDetails.length - 1].status = 'failed';
        }
      }

      var reportSkipped = dryRun ? brokenList.length : 0;
      figma.ui.postMessage({
        type: 'FIX_BROKEN_TOKENS_RESULT',
        requestId: msg.requestId,
        success: true,
        report: {
          scanned: reportScanned,
          broken: brokenList.length,
          fixed: reportFixed,
          skipped: reportSkipped,
          failed: reportFailed,
          details: reportDetails
        }
      });
      if (reportFixed > 0) {
        figma.notify(reportFixed + ' token(s) corrigidos', { timeout: 2000 });
      }
    } catch (error) {
      var errMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Fix broken tokens error:', errMsg);
      figma.ui.postMessage({
        type: 'FIX_BROKEN_TOKENS_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errMsg,
        report: { scanned: 0, broken: 0, fixed: 0, skipped: 0, failed: [], details: [] }
      });
    }
  }

  else if (msg.type === 'REPAIR_AND_RELINK_BY_TOKEN_MAP' || msg.type === 'RUN_RECURSIVE_TOKEN_FIX') {
    try {
      if (msg.type === 'RUN_RECURSIVE_TOKEN_FIX') {
        var defaultMap = {
          color: { light: { color: {
            background: { neutral: { base: { $type: 'color', $value: '#FCFCFD' } } },
            icon: { inverse: { $type: 'color', $value: '#FFFFFF' } },
            text: { primary: { $type: 'color', $value: '#1C2024' }, secondary: { $type: 'color', $value: '#6B7280' }, disabled: { $type: 'color', $value: '#9CA3AF' } },
            border: { default: { $type: 'color', $value: '#E5E7EB' } }
          } } }
        };
        var root = null;
        if (msg.nodeId) {
          root = await figma.getNodeByIdAsync(msg.nodeId);
          if (!root) throw new Error('Node not found: ' + msg.nodeId);
        } else {
          var sel = figma.currentPage.selection;
          if (sel && sel.length > 0) root = sel[0];
          else if (figma.currentPage) root = figma.currentPage;
        }
        if (!root) throw new Error('No nodeId and nothing selected. Select a component or pass nodeId.');
        msg.semanticMap = defaultMap;
        msg.primitiveMap = msg.primitiveMap || {};
        msg.scope = { type: 'node', nodeId: root.id };
        msg.requestId = msg.requestId || 'recursive-fix-' + Date.now();
      }
      var semanticMap = msg.semanticMap && typeof msg.semanticMap === 'object' ? msg.semanticMap : {};
      var primitiveMap = msg.primitiveMap && typeof msg.primitiveMap === 'object' ? msg.primitiveMap : {};
      var scope = msg.scope && typeof msg.scope === 'object' ? msg.scope : { type: 'document' };
      function normalizeHex(hexStr) {
        if (!hexStr || typeof hexStr !== 'string') return '';
        var h = hexStr.replace(/^#/, '').trim().toUpperCase();
        if (h.length === 8) h = h.substring(0, 6);
        return h.length === 6 ? h : '';
      }
      function rgbToHex(r, g, b) {
        return [r, g, b].map(function(x) {
          var n = Math.round(Math.max(0, Math.min(1, x)) * 255);
          var h = n.toString(16);
          return h.length === 1 ? '0' + h : h;
        }).join('').toUpperCase();
      }
      var hexToPath = {};
      var hexToPaths = {};
      function collectPaths(obj, prefix) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.$type === 'color' && obj.$value) {
          var hex = normalizeHex(obj.$value);
          if (hex) {
            var p = prefix || '';
            if (!hexToPath[hex]) hexToPath[hex] = p;
            if (!hexToPaths[hex]) hexToPaths[hex] = [];
            if (hexToPaths[hex].indexOf(p) === -1) hexToPaths[hex].push(p);
          }
        }
        for (var key in obj) {
          if (obj.hasOwnProperty(key) && key !== '$type' && key !== '$value' && key !== '$description') {
            var next = prefix ? prefix + '/' + key : key;
            collectPaths(obj[key], next);
          }
        }
      }
      collectPaths(semanticMap, '');
      collectPaths(primitiveMap, '');
      function pickPathForRole(hex, role) {
        var paths = hexToPaths[hex];
        if (!paths || paths.length === 0) return hexToPath[hex];
        if (role === 'text') {
          for (var i = 0; i < paths.length; i++) if (paths[i].toLowerCase().indexOf('text') !== -1) return paths[i];
        }
        if (role === 'stroke') {
          for (var j = 0; j < paths.length; j++) {
            var lower = paths[j].toLowerCase();
            if (lower.indexOf('border') !== -1 || lower.indexOf('stroke') !== -1) return paths[j];
          }
        }
        return hexToPath[hex] || (paths && paths[0]);
      }
      var roots = [];
      if (scope.type === 'node' && scope.nodeId) {
        var one = await figma.getNodeByIdAsync(scope.nodeId);
        if (one) roots.push(one);
      } else if (scope.type === 'page' && scope.pageId) {
        var page = await figma.getNodeByIdAsync(scope.pageId);
        if (page) roots.push(page);
      } else if (scope.type === 'page') {
        if (figma.currentPage) roots.push(figma.currentPage);
      } else {
        var pages = figma.root.children;
        for (var p = 0; p < pages.length; p++) roots.push(pages[p]);
      }
      if (roots.length === 0) throw new Error('No scope to scan');
      // Broken: fill/stroke bound to a variable that no longer exists
      var candidates = [];
      // Unlinked: fill/stroke with solid color and no variable (hardcoded hex)
      var unlinkedCandidates = [];
      // Style override: fill/stroke from fillStyleId/strokeStyleId (cor fixa no estilo → substituir por token)
      var styleFillOverrides = [];
      var styleStrokeOverrides = [];
      function walkCollect(node) {
        if (!node) return;
        // Fills (includes text color — TEXT nodes have fills)
        if ('fills' in node && node.fills && node.fills.length > 0) {
          var f = node.fills[0];
          var alias = f.boundVariables && f.boundVariables.color;
          var hasStyle = 'fillStyleId' in node && node.fillStyleId && String(node.fillStyleId).length > 0;
          if (alias && alias.id) {
            var r = f.type === 'SOLID' && f.color ? f.color.r : 0, g = f.type === 'SOLID' && f.color ? f.color.g : 0, b = f.type === 'SOLID' && f.color ? f.color.b : 0;
            candidates.push({ nodeId: node.id, name: node.name, variableId: alias.id, property: 'fill', strokeIndex: null, resolvedHex: rgbToHex(r, g, b) });
          } else if (!hasStyle && f.type === 'SOLID' && f.color) {
            var r = f.color.r, g = f.color.g, b = f.color.b;
            unlinkedCandidates.push({ nodeId: node.id, name: node.name, property: 'fill', strokeIndex: null, resolvedHex: rgbToHex(r, g, b), role: node.type === 'TEXT' ? 'text' : 'fill' });
          } else if (hasStyle) {
            styleFillOverrides.push({ nodeId: node.id, name: node.name, styleId: node.fillStyleId, property: 'fill', strokeIndex: null, role: node.type === 'TEXT' ? 'text' : 'fill' });
          }
        }
        // Strokes (borders, icon strokes)
        if ('strokes' in node && node.strokes && node.strokes.length > 0) {
          for (var s = 0; s < node.strokes.length; s++) {
            var st = node.strokes[s];
            var strokeAlias = st.boundVariables && st.boundVariables.color;
            var hasStrokeStyle = 'strokeStyleId' in node && node.strokeStyleId && String(node.strokeStyleId).length > 0;
            if (strokeAlias && strokeAlias.id) {
              var sr = st.type === 'SOLID' && st.color ? st.color.r : 0, sg = st.type === 'SOLID' && st.color ? st.color.g : 0, sb = st.type === 'SOLID' && st.color ? st.color.b : 0;
              candidates.push({ nodeId: node.id, name: node.name, variableId: strokeAlias.id, property: 'stroke', strokeIndex: s, resolvedHex: rgbToHex(sr, sg, sb) });
            } else if (!hasStrokeStyle && st.type === 'SOLID' && st.color) {
              var sr = st.color.r, sg = st.color.g, sb = st.color.b;
              unlinkedCandidates.push({ nodeId: node.id, name: node.name, property: 'stroke', strokeIndex: s, resolvedHex: rgbToHex(sr, sg, sb), role: 'stroke' });
            } else if (hasStrokeStyle) {
              styleStrokeOverrides.push({ nodeId: node.id, name: node.name, styleId: node.strokeStyleId, property: 'stroke', strokeIndex: s, role: 'stroke' });
            }
          }
        }
        if (node.children) for (var k = 0; k < node.children.length; k++) walkCollect(node.children[k]);
      }
      for (var r = 0; r < roots.length; r++) walkCollect(roots[r]);
      var brokenList = [];
      for (var b = 0; b < candidates.length; b++) {
        var it = candidates[b];
        try {
          var v = await figma.variables.getVariableByIdAsync(it.variableId);
          if (!v) brokenList.push(it);
        } catch (e) { brokenList.push(it); }
      }
      // Resolve style overrides: get solid color from PaintStyle and add to list to fix
      var styleOverrideResolved = [];
      for (var si = 0; si < styleFillOverrides.length; si++) {
        var so = styleFillOverrides[si];
        try {
          var fillStyle = await figma.getStyleByIdAsync(so.styleId);
          if (fillStyle && fillStyle.paints && fillStyle.paints.length > 0) {
            var paint0 = fillStyle.paints[0];
            if (paint0.type === 'SOLID' && paint0.color) {
              var cr = paint0.color.r, cg = paint0.color.g, cb = paint0.color.b;
              styleOverrideResolved.push({ nodeId: so.nodeId, name: so.name, property: 'fill', strokeIndex: null, resolvedHex: rgbToHex(cr, cg, cb), role: so.role });
            }
          }
        } catch (e) { /* style not found or not paint */ }
      }
      for (var sj = 0; sj < styleStrokeOverrides.length; sj++) {
        var so2 = styleStrokeOverrides[sj];
        try {
          var strokeStyle = await figma.getStyleByIdAsync(so2.styleId);
          if (strokeStyle && strokeStyle.paints && strokeStyle.paints.length > 0) {
            var paint0s = strokeStyle.paints[0];
            if (paint0s.type === 'SOLID' && paint0s.color) {
              var scr = paint0s.color.r, scg = paint0s.color.g, scb = paint0s.color.b;
              styleOverrideResolved.push({ nodeId: so2.nodeId, name: so2.name, property: 'stroke', strokeIndex: so2.strokeIndex, resolvedHex: rgbToHex(scr, scg, scb), role: so2.role });
            }
          }
        } catch (e) { /* style not found or not paint */ }
      }
      // toFix = broken + unlinked (hardcoded) + style overrides (estilo com cor fixa)
      var toFix = brokenList.concat(unlinkedCandidates, styleOverrideResolved);
      var variables = await figma.variables.getLocalVariablesAsync();
      function normalizePath(name) {
        if (!name || typeof name !== 'string') return '';
        return name.replace(/\./g, '/').replace(/\\/g, '/').toLowerCase();
      }
      var pathToVariable = {};
      for (var vi = 0; vi < variables.length; vi++) {
        var vv = variables[vi];
        if (vv.resolvedType !== 'COLOR') continue;
        var key = normalizePath(vv.name);
        if (key && !pathToVariable[key]) pathToVariable[key] = vv;
      }
      var linked = [], noMatch = [];
      for (var i = 0; i < toFix.length; i++) {
        var it = toFix[i];
        var hex = normalizeHex(it.resolvedHex || '');
        var path = pickPathForRole(hex, it.role);
        if (!path) {
          noMatch.push({ nodeId: it.nodeId, name: it.name, property: it.property, resolvedHex: '#' + hex, reason: 'no token path for hex' });
          continue;
        }
        var pathKey = normalizePath(path);
        var variable = pathToVariable[pathKey];
        if (!variable) {
          noMatch.push({ nodeId: it.nodeId, name: it.name, property: it.property, tokenPath: path, reason: 'no variable matching path' });
          continue;
        }
        var node = await figma.getNodeByIdAsync(it.nodeId);
        if (!node) { noMatch.push({ nodeId: it.nodeId, name: it.name, property: it.property, reason: 'node not found' }); continue; }
        try {
          var variableRef = await figma.variables.getVariableByIdAsync(variable.id);
          if (!variableRef || variableRef.resolvedType !== 'COLOR') {
            noMatch.push({ nodeId: it.nodeId, name: it.name, property: it.property, tokenPath: path, reason: 'variable not color' });
            continue;
          }
          if (it.property === 'fill' && 'fills' in node) {
            var fillsCopy = node.fills && node.fills.length > 0 ? JSON.parse(JSON.stringify(node.fills)) : [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }];
            fillsCopy[0] = fillsCopy[0].type === 'SOLID' ? figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', variableRef) : figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }, 'color', variableRef);
            node.fills = fillsCopy;
            if ('fillStyleId' in node && node.fillStyleId) node.fillStyleId = '';
            linked.push({ nodeId: it.nodeId, name: it.name, property: 'fill', variableName: variable.name, variableId: variable.id, tokenPath: path });
          } else if (it.property === 'stroke' && 'strokes' in node && node.strokes) {
            var idx = it.strokeIndex != null ? it.strokeIndex : 0;
            var strokesCopy = JSON.parse(JSON.stringify(node.strokes));
            strokesCopy[idx] = figma.variables.setBoundVariableForPaint(strokesCopy[idx], 'color', variableRef);
            node.strokes = strokesCopy;
            if ('strokeStyleId' in node && node.strokeStyleId) node.strokeStyleId = '';
            linked.push({ nodeId: it.nodeId, name: it.name, property: 'stroke', variableName: variable.name, variableId: variable.id, tokenPath: path });
          } else {
            noMatch.push({ nodeId: it.nodeId, name: it.name, property: it.property, reason: 'could not apply' });
          }
        } catch (e) {
          noMatch.push({ nodeId: it.nodeId, name: it.name, property: it.property, tokenPath: path, error: e.message });
        }
      }
      figma.ui.postMessage({
        type: 'REPAIR_AND_RELINK_BY_TOKEN_MAP_RESULT',
        requestId: msg.requestId,
        success: true,
        linked: linked,
        noMatch: noMatch,
        brokenFound: brokenList.length,
        unlinkedFound: unlinkedCandidates.length,
        styleOverrideFound: styleOverrideResolved.length,
        totalFixed: linked.length,
        tokenPathsCount: Object.keys(hexToPath).length,
        variablesByPathCount: Object.keys(pathToVariable).length
      });
    } catch (error) {
      var errMsg = error && error.message ? error.message : String(error);
      console.error('🌉 [Desktop Bridge] Repair and relink by token map error:', errMsg);
      figma.ui.postMessage({
        type: 'REPAIR_AND_RELINK_BY_TOKEN_MAP_RESULT',
        requestId: msg.requestId,
        success: false,
        error: errMsg,
        linked: [],
        noMatch: []
      });
    }
  }

  // ============================================================================
  // REPLACE_COLOR_TOKEN - Replace one color variable binding with another on a node (and its descendants)
  // Params: nodeId (optional; use selection if omitted), fromToken or fromVariableId, toToken or toVariableId
  // ============================================================================
  else if (msg.type === 'REPLACE_COLOR_TOKEN') {
    try {
      var root = null;
      if (msg.nodeId) {
        root = await figma.getNodeByIdAsync(msg.nodeId);
        if (!root) throw new Error('Node not found: ' + msg.nodeId);
      } else {
        var sel = figma.currentPage.selection;
        if (!sel || sel.length === 0) throw new Error('No nodeId provided and nothing selected. Select the linked component or pass nodeId.');
        root = sel[0];
      }
      var fromId = msg.fromVariableId;
      var toId = msg.toVariableId;
      if (!fromId && msg.fromToken) {
        var localVars = await figma.variables.getLocalVariablesAsync();
        var fromName = String(msg.fromToken).replace(/\./g, '/').trim();
        var fromVar = localVars.find(function(v) { return v.resolvedType === 'COLOR' && (v.name === fromName || v.name.replace(/\./g, '/') === fromName); });
        if (!fromVar) throw new Error('Variable not found for fromToken: ' + msg.fromToken);
        fromId = fromVar.id;
      }
      if (!toId && msg.toToken) {
        var localVarsTo = await figma.variables.getLocalVariablesAsync();
        var toName = String(msg.toToken).replace(/\./g, '/').trim();
        var toVar = localVarsTo.find(function(v) { return v.resolvedType === 'COLOR' && (v.name === toName || v.name.replace(/\./g, '/') === toName); });
        if (!toVar) throw new Error('Variable not found for toToken: ' + msg.toToken);
        toId = toVar.id;
      }
      if (!fromId || !toId) throw new Error('Provide fromToken/fromVariableId and toToken/toVariableId');
      var toVariable = await figma.variables.getVariableByIdAsync(toId);
      if (!toVariable || toVariable.resolvedType !== 'COLOR') throw new Error('Target variable not found or not a color: ' + toId);
      var replaced = [];
      function walk(node) {
        if (!node) return;
        if ('fills' in node && node.fills && node.fills.length > 0) {
          var f = node.fills[0];
          var alias = f.boundVariables && f.boundVariables.color;
          if (alias && alias.id === fromId) {
            var fillsCopy = JSON.parse(JSON.stringify(node.fills));
            fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', toVariable);
            node.fills = fillsCopy;
            replaced.push({ nodeId: node.id, name: node.name, property: 'fill' });
          }
        }
        if ('strokes' in node && node.strokes && node.strokes.length > 0) {
          for (var s = 0; s < node.strokes.length; s++) {
            var st = node.strokes[s];
            var sa = st.boundVariables && st.boundVariables.color;
            if (sa && sa.id === fromId) {
              var strokesCopy = JSON.parse(JSON.stringify(node.strokes));
              strokesCopy[s] = figma.variables.setBoundVariableForPaint(strokesCopy[s], 'color', toVariable);
              node.strokes = strokesCopy;
              replaced.push({ nodeId: node.id, name: node.name, property: 'stroke', index: s });
            }
          }
        }
        if (node.children) for (var i = 0; i < node.children.length; i++) walk(node.children[i]);
      }
      walk(root);
      ok(msg.type, msg.requestId, { replaced: replaced, count: replaced.length });
    } catch (e) {
      fail(msg.type, msg.requestId, e);
    }
  }

  else if (msg.type === 'SCAN_UNLINKED_TOKENS' || msg.type === 'REPLACE_TYPO_TOKEN' || msg.type === 'REPAIR_TOKENS_BY_MAP') {
    try { fail(msg.type, msg.requestId, new Error('Not implemented')); } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'APPLY_TEXT_STYLE') {
    try { fail(msg.type, msg.requestId, new Error('Not implemented')); } catch (e) { fail(msg.type, msg.requestId, e); }
  }

  else if (msg.type === 'LOAD_FONTS') {
    try {
      var families = msg.families || [];
      for (var f = 0; f < families.length; f++) { await figma.loadFontAsync({ family: families[f], style: 'Regular' }); }
      ok(msg.type, msg.requestId, { data: { loaded: families.length } });
    } catch (e) { fail(msg.type, msg.requestId, e); }
  }
};

// ============================================================================
// DOCUMENT CHANGE LISTENER - Forward change events for cache invalidation
// Fires when variables, styles, or nodes change (by any means — user edits, API, etc.)
// Requires figma.loadAllPagesAsync() in dynamic-page mode before registering.
// ============================================================================
figma.loadAllPagesAsync().then(function() {
  figma.on('documentchange', function(event) {
    var hasStyleChanges = false;
    var hasNodeChanges = false;
    var changedNodeIds = [];

    for (var i = 0; i < event.documentChanges.length; i++) {
      var change = event.documentChanges[i];
      if (change.type === 'STYLE_CREATE' || change.type === 'STYLE_DELETE' || change.type === 'STYLE_PROPERTY_CHANGE') {
        hasStyleChanges = true;
      } else if (change.type === 'CREATE' || change.type === 'DELETE' || change.type === 'PROPERTY_CHANGE') {
        hasNodeChanges = true;
        if (change.id && changedNodeIds.length < 50) {
          changedNodeIds.push(change.id);
        }
      }
    }

    if (hasStyleChanges || hasNodeChanges) {
      figma.ui.postMessage({
        type: 'DOCUMENT_CHANGE',
        data: {
          hasStyleChanges: hasStyleChanges,
          hasNodeChanges: hasNodeChanges,
          changedNodeIds: changedNodeIds,
          changeCount: event.documentChanges.length,
          timestamp: Date.now()
        }
      });
    }
  });
  // Selection change listener — tracks what the user has selected in Figma
  figma.on('selectionchange', function() {
    var selection = figma.currentPage.selection;
    var selectedNodes = [];
    for (var i = 0; i < Math.min(selection.length, 50); i++) {
      var node = selection[i];
      selectedNodes.push({
        id: node.id,
        name: node.name,
        type: node.type,
        width: node.width,
        height: node.height
      });
    }
    figma.ui.postMessage({
      type: 'SELECTION_CHANGE',
      data: {
        nodes: selectedNodes,
        count: selection.length,
        page: figma.currentPage.name,
        timestamp: Date.now()
      }
    });
  });

  // Page change listener — tracks which page the user is viewing
  figma.on('currentpagechange', function() {
    figma.ui.postMessage({
      type: 'PAGE_CHANGE',
      data: {
        pageId: figma.currentPage.id,
        pageName: figma.currentPage.name,
        timestamp: Date.now()
      }
    });
  });

  console.log('🌉 [Desktop Bridge] Document change, selection, and page listeners registered');
}).catch(function(err) {
  console.warn('🌉 [Desktop Bridge] Could not register event listeners:', err);
});

console.log('🌉 [Desktop Bridge] Ready to handle component requests');
console.log('🌉 [Desktop Bridge] Plugin will stay open until manually closed');

// Plugin stays open - no auto-close
// UI iframe remains accessible for Puppeteer to read data from window object
