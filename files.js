// sessions.js persists file associations; Save writes to the active file.
let fileBinding = null;
let fileName = "sketch.js";
let saveQueue = Promise.resolve();
const fileTypes = [
  { description: "JavaScript", accept: { "text/javascript": [".js"] } },
];
const supportsFiles =
  typeof window.showSaveFilePicker === "function" &&
  typeof window.showOpenFilePicker === "function";
function fileStatus(text) {
  $("save").textContent = text;
  $("save").title = text;
}
function resetFileBinding() {
  fileBinding = null;
  fileName = "sketch.js";
  fileStatus("Untitled · Unsaved");
  window.sessions?.detach();
}
function bindFile(handle, name, code) {
  fileName = name;
  fileBinding =
    handle?.kind === "directory"
      ? null
      : handle
        ? { handle, saved: code, sessionId: sessions.activeId }
        : null;
  fileStatus(name + " · Opened");
  sessions.bound(fileBinding?.handle || null, name, code);
}
function scheduleFileSave() {
  fileStatus(fileName + " · Unsaved");
}
function downloadCode() {
  const code = codeEditor.getValue();
  const url = URL.createObjectURL(
    new Blob([code], { type: "text/javascript;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  lastSaved = code;
  sessions.capture();
  fileStatus(fileName + " · Copy downloaded");
}
async function saveBoundFile() {
  const binding = fileBinding;
  if (!binding) return;
  // Request permission during the user gesture and handle rejection before queuing.
  const permission = binding.handle
    .requestPermission({ mode: "readwrite" })
    .catch(() => "denied");
  const task = async () => {
    let stream;
    try {
      if ((await permission) !== "granted")
        throw new Error("Click Save JS again and allow file access.");
      if (fileBinding !== binding) return;
      const code = codeEditor.getValue();
      const current = await (await binding.handle.getFile()).text();
      if (fileBinding !== binding) return;
      if (current !== binding.saved)
        throw new Error(
          "This file changed in another app. Open it again before editing.",
        );
      fileStatus(binding.handle.name + " · Saving…");
      stream = await binding.handle.createWritable();
      if (fileBinding !== binding) {
        await stream.abort();
        return;
      }
      await stream.write(code);
      await stream.close();
      binding.saved = code;
      sessions.recordedSave(binding.sessionId, code, binding);
      if (fileBinding !== binding) return;
      lastSaved = code;
      fileStatus(
        binding.handle.name +
          (codeEditor.getValue() === code ? " · Saved" : " · Unsaved"),
      );
    } catch (error) {
      if (stream) {
        try {
          await stream.abort();
        } catch {}
      }
      if (error.name === "NotFoundError") {
        await sessions.missingFile(binding.sessionId, binding.handle.name);
        return;
      }
      if (fileBinding === binding) fileStatus("Unsaved · " + error.message);
    }
  };
  saveQueue = saveQueue.then(task, task);
  return saveQueue;
}
$("open-local").onclick = async () => {
  if (sessions.busy) return;
  const owner = sessions.activeId;
  if (!supportsFiles) {
    $("file").click();
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      types: fileTypes,
      multiple: false,
    });
    const file = await handle.getFile();
    if (!/\.js$/i.test(file.name)) {
      importError("Choose a .js file.");
      return;
    }
    const code = await file.text();
    if (owner === sessions.activeId && replace(code))
      bindFile(handle, handle.name, code);
  } catch (error) {
    if (error.name !== "AbortError")
      fileStatus("Not opened · " + error.message);
  }
};
$("save-local").onclick = async () => {
  if (sessions.busy) return;
  const owner = sessions.activeId;
  if (!supportsFiles) {
    downloadCode();
    return;
  }
  if (fileBinding) {
    await saveBoundFile();
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: fileTypes,
    });
    const saved = await (await handle.getFile()).text();
    if (owner !== sessions.activeId) return;
    fileName = handle.name;
    fileBinding = { handle, saved, sessionId: owner };
    sessions.bound(handle, handle.name, saved);
    await saveBoundFile();
  } catch (error) {
    if (error.name !== "AbortError") fileStatus("Unsaved · " + error.message);
  }
};
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    $("save-local").click();
  }
});
