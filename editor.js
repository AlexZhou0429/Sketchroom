// Offline CodeMirror editor. Each session owns a separate document/undo history.
const codeEditor = (() => {
  const globals = Object.fromEntries(
    (window.p5EditorGlobals || []).map((name) => [name, true]),
  );
  const callbacks = new Set([
    "setup",
    "draw",
    "preload",
    "mousePressed",
    "mouseReleased",
    "mouseClicked",
    "doubleClicked",
    "mouseMoved",
    "mouseDragged",
    "mouseWheel",
    "keyPressed",
    "keyReleased",
    "keyTyped",
    "touchStarted",
    "touchMoved",
    "touchEnded",
    "windowResized",
    "deviceMoved",
    "deviceTurned",
    "deviceShaken",
  ]);
  function lint(text) {
    JSHINT(
      text,
      {
        esversion: 11,
        browser: true,
        devel: true,
        undef: true,
        unused: "vars",
        asi: true,
        indent: 1,
        maxerr: 50,
      },
      globals,
    );
    const output = (JSHINT.errors || [])
      .filter(
        (e) => e && e.line > 0 && !(e.code === "W098" && callbacks.has(e.a)),
      )
      .map((e) => {
        const line = Math.max(
          0,
          Math.min(text.split("\n").length - 1, e.line - 1),
        );
        const content = text.split("\n")[line] || "";
        const start = Math.max(0, Math.min(content.length, e.character - 1));
        const token = content.slice(start).match(/^[\w$]+/);
        let message = e.reason;
        if (e.code === "W117")
          message = "Undefined variable or function: " + e.a;
        if (e.code === "W098") message = "Declared but never used: " + e.a;
        return {
          from: CodeMirror.Pos(line, start),
          to: CodeMirror.Pos(
            line,
            Math.min(content.length, start + (token?.[0].length || 1)),
          ),
          severity: e.code?.startsWith("W") ? "warning" : "error",
          message,
        };
      });
    const errors = output.filter((e) => e.severity === "error").length;
    const warnings = output.length - errors;
    document.getElementById("diagnostics").textContent = output.length
      ? `${errors} errors · ${warnings} warnings`
      : "";
    return output;
  }
  let suppress = false,
    listener = () => {},
    activeId = null;
  const documents = new Map();
  const cm = CodeMirror.fromTextArea(document.getElementById("code"), {
    mode: "javascript",
    lineNumbers: true,
    tabSize: 2,
    indentUnit: 2,
    indentWithTabs: false,
    smartIndent: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    styleActiveLine: true,
    lineWrapping: false,
    screenReaderLabel: "JavaScript code editor",
    gutters: ["CodeMirror-linenumbers", "CodeMirror-lint-markers"],
    lint: { getAnnotations: lint, delay: 450 },
    extraKeys: {
      Tab: (editor) =>
        editor.somethingSelected()
          ? editor.indentSelection("add")
          : editor.execCommand("insertSoftTab"),
      "Shift-Tab": "indentLess",
      "Ctrl-/": "toggleComment",
      "Cmd-/": "toggleComment",
      "Ctrl-Space": (editor) =>
        editor.showHint({
          hint: CodeMirror.hint.javascript,
          additionalContext: globals,
          completeSingle: false,
        }),
      "Ctrl-S": () => document.getElementById("save-local").click(),
      "Cmd-S": () => document.getElementById("save-local").click(),
      "Ctrl-Enter": () => document.getElementById("run").click(),
      "Cmd-Enter": () => document.getElementById("run").click(),
      Esc: () =>
        document.querySelector('[data-fullscreen="editor-panel"]').focus(),
    },
  });
  cm.on("change", () => {
    if (!suppress) listener();
  });
  const observer = new ResizeObserver(() => cm.refresh());
  observer.observe(document.getElementById("editor-host"));
  function withSuppressed(action) {
    suppress = true;
    try {
      action();
    } finally {
      suppress = false;
    }
  }
  return {
    cm,
    getValue: () => cm.getValue(),
    setValue: (text) =>
      withSuppressed(() => {
        cm.setValue(text);
        cm.clearHistory();
      }),
    switchSession: (id, text) =>
      withSuppressed(() => {
        if (activeId) documents.set(activeId, cm.getDoc());
        let doc = documents.get(id);
        if (!doc || doc.getValue() !== text)
          doc = new CodeMirror.Doc(text, "javascript");
        documents.set(id, doc);
        activeId = id;
        cm.swapDoc(doc);
        cm.performLint();
      }),
    forgetSession: (id) => documents.delete(id),
    setReadOnly: (disabled) => cm.setOption("readOnly", disabled),
    onChange: (fn) => (listener = fn),
    refresh: () => cm.refresh(),
    focus: () => cm.focus(),
  };
})();
