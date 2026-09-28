const $ = (id) => document.getElementById(id);
const template = `function setup() {
  createCanvas(560, 360);
}

function draw() {
  background(255);
}`;
let timer,
  frame,
  paused = false,
  failed = false,
  lastSaved = "",
  messages = [];
codeEditor.setValue(template);
lastSaved = codeEditor.getValue();
function lines() {
  codeEditor.refresh();
}
function clear() {
  messages = [];
  $("message-count").textContent = "0 / 50";
  $("messages").textContent = "";
  document.querySelector(".feedback").classList.remove("error");
  $("message-title").textContent = "Console";
}
function run() {
  clearTimeout(timer);
  clear();
  failed = false;
  paused = false;
  $("pause").textContent = "Pause";
  $("pause").disabled = true;
  $("status").textContent = "Starting…";
  const next = document.createElement("iframe");
  next.title = "p5.js preview";
  next.setAttribute("sandbox", "allow-scripts allow-same-origin");
  next.src = "runner.html";
  const source = codeEditor.getValue();
  next.onload = () =>
    next.contentWindow.postMessage(
      { studio: true, type: "code", code: source },
      "*",
    );
  frame = next;
  $("stage").replaceChildren(next);
}
function changed() {
  sessions.capture();
  scheduleFileSave();
  lines();
  clearTimeout(timer);
  if ($("live").checked) timer = setTimeout(run, 700);
  else $("status").textContent = "Changed · Run to preview";
}
codeEditor.onChange(changed);
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    run();
  }
});
$("run").onclick = run;
$("live").onchange = () => {
  sessions.capture();
  clearTimeout(timer);
  if ($("live").checked) run();
};
$("clear").onclick = clear;
$("pause").onclick = () => {
  paused = !paused;
  frame?.contentWindow.postMessage(
    { studio: true, type: paused ? "pause" : "resume" },
    "*",
  );
  $("pause").textContent = paused ? "Resume" : "Pause";
};
window.addEventListener("message", (e) => {
  if (e.source !== frame?.contentWindow || !e.data?.studio) return;
  const { type, text } = e.data;
  if (type === "running") {
    if (!failed) {
      $("status").textContent = "Running";
      $("pause").disabled = false;
    }
  } else if (type === "paused") $("status").textContent = "Paused";
  else {
    if (type === "error") {
      failed = true;
      $("status").textContent = "Check code";
      document.querySelector(".feedback").classList.add("error");
      $("message-title").textContent = "Errors";
    }
    appendMessage(text || type);
  }
});
function replace(code) {
  if (
    codeEditor.getValue() !== lastSaved &&
    !confirm(
      "Replace the current code? Cancel and save your JS first if you want to keep it.",
    )
  )
    return false;
  resetFileBinding();
  codeEditor.setValue(code);
  lastSaved = code;
  lines();
  run();
  return true;
}
function importError(message) {
  clear();
  document.querySelector(".feedback").classList.add("error");
  $("message-title").textContent = "Could not open file";
  $("messages").textContent = message;
}
async function importFiles(files, handlePromise = null) {
  if (sessions.busy) return;
  if (files.length !== 1) {
    importError("Drop one .js file at a time.");
    return;
  }
  const file = files[0];
  if (!/\.js$/i.test(file.name)) {
    importError("Choose a .js file. Your current code is unchanged.");
    return;
  }
  const owner = sessions.activeId;
  try {
    const code = await file.text();
    let handle = null;
    try {
      handle = await handlePromise;
    } catch {}
    if (owner === sessions.activeId && replace(code))
      bindFile(handle, file.name, code);
  } catch {
    importError("Could not read this file. Please select it again.");
  }
}
$("file").onchange = async (e) => {
  if (e.target.files.length) await importFiles(e.target.files);
  e.target.value = "";
};
let dragDepth = 0;
function stopDrag() {
  dragDepth = 0;
  $("drop-overlay").hidden = true;
}
document.addEventListener("dragenter", (e) => {
  if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
  e.preventDefault();
  dragDepth++;
  $("drop-overlay").hidden = false;
});
document.addEventListener("dragover", (e) => {
  if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});
document.addEventListener("dragleave", (e) => {
  if (--dragDepth <= 0) stopDrag();
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  stopDrag();
  if (e.dataTransfer?.files.length) {
    const item = e.dataTransfer.items[0];
    // Capture the handle during drop; associate it after reading the file.
    const handle =
      e.dataTransfer.files.length === 1 && item?.getAsFileSystemHandle
        ? item.getAsFileSystemHandle()
        : null;
    importFiles(Array.from(e.dataTransfer.files), handle);
  }
});
window.addEventListener("blur", stopDrag);
document.addEventListener("dragend", stopDrag);

lines();

function appendMessage(text) {
  const box = $("messages");
  messages.push(String(text));
  if (messages.length > 50) messages.shift();
  box.textContent = messages.join("\n") + "\n";
  box.scrollTop = box.scrollHeight;
  $("message-count").textContent = messages.length + " / 50";
}

// Each pane supports fullscreen, with a full-window fallback.
let expandedPanel = null;
function syncFullscreen() {
  const active = document.fullscreenElement || expandedPanel;
  document.body.classList.toggle("panel-open", !!active);
  document.querySelectorAll("[data-fullscreen]").forEach((button) => {
    const selected = active?.id === button.dataset.fullscreen;
    button.textContent = selected ? "Exit fullscreen" : "Fullscreen";
    button.setAttribute("aria-pressed", String(selected));
  });
}
async function toggleFullscreen(panel) {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else if (expandedPanel) {
    expandedPanel.classList.remove("panel-expanded");
    expandedPanel = null;
  } else {
    try {
      if (!panel.requestFullscreen) throw new Error("fallback");
      await panel.requestFullscreen();
    } catch {
      expandedPanel = panel;
      panel.classList.add("panel-expanded");
    }
  }
  syncFullscreen();
}
document.querySelectorAll("[data-fullscreen]").forEach((button) => {
  button.onclick = () => toggleFullscreen($(button.dataset.fullscreen));
});
document.addEventListener("fullscreenchange", syncFullscreen);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && expandedPanel) toggleFullscreen(expandedPanel);
});

const divider = $("divider");
let splitRatio = 0.5;
function setSplit(ratio) {
  splitRatio = Math.max(0.2, Math.min(0.8, ratio));
  $("workspace").style.setProperty(
    "--split",
    splitRatio / (1 - splitRatio) + "fr",
  );
  divider.setAttribute("aria-valuenow", String(Math.round(splitRatio * 100)));
  window.sessions?.capture();
}
divider.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  divider.setPointerCapture(e.pointerId);
  divider.focus();
  document.body.classList.add("resizing");
});
divider.addEventListener("pointermove", (e) => {
  if (!divider.hasPointerCapture(e.pointerId)) return;
  const rect = $("workspace").getBoundingClientRect();
  setSplit((e.clientX - rect.left - 9) / (rect.width - 18));
});
function endResize() {
  document.body.classList.remove("resizing");
}
divider.addEventListener("pointerup", (e) => {
  if (divider.hasPointerCapture(e.pointerId))
    divider.releasePointerCapture(e.pointerId);
  endResize();
});
divider.addEventListener("lostpointercapture", endResize);
divider.addEventListener("pointercancel", endResize);
divider.addEventListener("dblclick", () => setSplit(0.5));
divider.addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) return;
  e.preventDefault();
  setSplit(
    e.key === "Home"
      ? 0.5
      : splitRatio + (e.key === "ArrowLeft" ? -0.02 : 0.02),
  );
});

// Collapsing the console returns its height to the two editor panes.
function setConsoleCollapsed(collapsed) {
  $("messages").hidden = collapsed;
  document.body.classList.toggle("console-collapsed", collapsed);
  $("console-toggle").setAttribute("aria-expanded", String(!collapsed));
  $("console-chevron").textContent = collapsed ? "›" : "⌄";
  if (!collapsed) $("messages").scrollTop = $("messages").scrollHeight;
  try {
    localStorage.setItem("sketchroom-console-collapsed", String(collapsed));
  } catch {}
}
$("console-toggle").onclick = () => setConsoleCollapsed(!$("messages").hidden);
try {
  setConsoleCollapsed(
    localStorage.getItem("sketchroom-console-collapsed") === "true",
  );
} catch {}
