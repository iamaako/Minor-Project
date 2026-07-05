// js/monaco-env.js
// Must be loaded BEFORE monaco-editor/min/vs/loader.js
self.MonacoEnvironment = {
  getWorkerUrl: function(moduleId, label) {
    if (label === 'json')
      return '../../node_modules/monaco-editor/min/vs/language/json/json.worker.js';
    if (label === 'css' || label === 'scss' || label === 'less')
      return '../../node_modules/monaco-editor/min/vs/language/css/css.worker.js';
    if (label === 'typescript' || label === 'javascript')
      return '../../node_modules/monaco-editor/min/vs/language/typescript/ts.worker.js';
    return '../../node_modules/monaco-editor/min/vs/editor/editor.worker.js';
  }
};
