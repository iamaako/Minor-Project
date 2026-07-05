// js/monaco-boot.js
// Runs AFTER loader.js is loaded — configures AMD paths and boots app.js
require.config({
  paths: { 'vs': '../../node_modules/monaco-editor/min/vs' }
});

require(['vs/editor/editor.main'], function() {
  // Monaco ready — load and boot the main app controller
  var script = document.createElement('script');
  script.src = 'js/app.js';
  document.body.appendChild(script);
});
