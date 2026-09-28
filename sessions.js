// Drafts are written synchronously; structured-clone file handles live in IndexedDB.
(() => {
  const key = "sketchroom-sessions-v1";
  let state,
    restoring = false,
    storageOK = true,
    pendingHandles = 0;
  let activation = 0,
    dialogQueue = Promise.resolve();
  const handles = new Map();
  const fresh = (name = "New session") => ({
    id: crypto.randomUUID(),
    name,
    code: template,
    lastSaved: template,
    fileName: "sketch.js",
    linked: false,
    hasHandle: false,
    baseline: null,
    live: true,
    split: 0.5,
  });
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (
      stored?.version === 1 &&
      Array.isArray(stored.items) &&
      stored.items.length &&
      stored.items.every(
        (s) => typeof s.id === "string" && typeof s.code === "string",
      )
    )
      state = stored;
  } catch {}
  if (!state) {
    const first = fresh("Session 1");
    state = { version: 1, activeId: first.id, items: [first] };
  }
  if (!state.items.some((s) => s.id === state.activeId))
    state.activeId = state.items[0].id;
  const current = () => state.items.find((s) => s.id === state.activeId);
  const db = new Promise((resolve) => {
    try {
      const request = indexedDB.open("sketchroom-file-handles", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("handles");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  async function handleOperation(mode, id, value) {
    const database = await db;
    if (!database)
      throw new Error(
        "File associations could not be saved. Please drop the file again.",
      );
    return new Promise((resolve, reject) => {
      const tx = database.transaction(
        "handles",
        mode === "get" ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("handles");
      let request;
      try {
        request =
          mode === "get"
            ? store.get(id)
            : mode === "put"
              ? store.put(value, id)
              : store.delete(id);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () =>
        reject(tx.error || new Error("Could not save the file association."));
    });
  }
  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify(state));
      storageOK = true;
    } catch {
      storageOK = false;
    }
    $("session-storage").textContent = storageOK
      ? ""
      : "Browser storage is unavailable or full. Save your JS to keep this session.";
    if (!storageOK) fileStatus("Session not saved · Save your JS");
  }
  function capture() {
    if (restoring || !current()) return;
    Object.assign(current(), {
      code: codeEditor.getValue(),
      lastSaved,
      live: $("live").checked,
      split: splitRatio,
    });
    persist();
  }
  function saveHandle(id, handle) {
    if (handle) handles.set(id, handle);
    else handles.delete(id);
    pendingHandles++;
    handleOperation(handle ? "put" : "delete", id, handle)
      .catch((error) => {
        const item = state.items.find((s) => s.id === id);
        if (item && handle) {
          item.hasHandle = false;
          persist();
        }
        $("session-storage").textContent = error.message;
      })
      .finally(() => pendingHandles--);
  }
  function detach() {
    const item = current();
    if (!item) return;
    Object.assign(item, {
      linked: false,
      hasHandle: false,
      baseline: null,
      fileName: "sketch.js",
    });
    saveHandle(item.id, null);
  }
  function bound(handle, name, code) {
    const item = current();
    Object.assign(item, {
      linked: true,
      hasHandle: !!handle,
      fileName: name,
      baseline: code,
    });
    if (!item.renamed) item.name = name;
    saveHandle(item.id, handle);
    capture();
    render();
  }
  function recordedSave(id, code, binding) {
    const item = state.items.find((s) => s.id === id);
    if (!item || handles.get(id) !== binding.handle) return;
    item.lastSaved = code;
    item.baseline = code;
    if (id === state.activeId && fileBinding === binding) lastSaved = code;
    persist();
    render();
  }
  function modal(
    message,
    confirm = false,
    title = confirm ? "Reset session" : "Notice",
  ) {
    const operation = () =>
      new Promise((resolve) => {
        const dialog = $("session-dialog");
        $("dialog-title").textContent = title;
        $("dialog-message").textContent = message;
        $("dialog-no").hidden = !confirm;
        $("dialog-yes").textContent = confirm ? "Yes" : "OK";
        let choice = false;
        $("dialog-no").onclick = () => dialog.close();
        $("dialog-yes").onclick = () => {
          choice = true;
          dialog.close();
        };
        dialog.onclose = () => {
          dialog.onclose = null;
          resolve(choice);
        };
        dialog.showModal();
        (confirm ? $("dialog-no") : $("dialog-yes")).focus();
      });
    const result = dialogQueue.then(operation, operation);
    dialogQueue = result.then(() => {});
    return result;
  }
  const narrow = matchMedia("(max-width:1190px)");
  let editingId = null,
    actionsTrigger = null;
  function syncDrawer() {
    const open = !$("sessions-menu").hidden;
    $("app-shell").inert = open && narrow.matches;
    if (open && narrow.matches) {
      $("sessions-menu").setAttribute("role", "dialog");
      $("sessions-menu").setAttribute("aria-modal", "true");
    } else {
      $("sessions-menu").removeAttribute("role");
      $("sessions-menu").removeAttribute("aria-modal");
    }
  }
  function menu(open, focus = true) {
    $("sessions-menu").hidden = !open;
    $("sessions-shade").hidden = !open;
    document.body.classList.toggle("sidebar-open", open);
    $("sessions-toggle").setAttribute("aria-expanded", String(open));
    state.sidebarOpen = open;
    persist();
    syncDrawer();
    if (focus) (open ? $("session-new") : $("sessions-toggle")).focus();
  }
  narrow.addEventListener("change", syncDrawer);
  function closeActions() {
    const popup = $("session-actions-popover");
    if (popup.matches(":popover-open")) popup.hidePopover();
  }
  function render() {
    $("current-session").textContent = current()?.name || "";
    $("current-session").title = current()?.name || "";
    $("session-count").textContent = state.items.length;
    const list = $("session-list");
    list.replaceChildren();
    const query = $("session-search").value.trim().toLocaleLowerCase();
    const visible = state.items.filter((item) =>
      (item.name + " " + (item.linked ? item.fileName : ""))
        .toLocaleLowerCase()
        .includes(query),
    );
    $("session-list-count").textContent = visible.length;
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "session-empty";
      empty.textContent = "No matching sessions";
      list.append(empty);
    }
    for (const item of visible) {
      const row = document.createElement("div");
      row.className =
        "session-item" + (item.id === state.activeId ? " active" : "");
      if (editingId === item.id) {
        const form = document.createElement("form");
        form.className = "session-rename";
        const input = document.createElement("input");
        input.value = item.name;
        input.setAttribute("aria-label", "Session name");
        input.required = true;
        const yes = document.createElement("button");
        yes.textContent = "✓";
        yes.setAttribute("aria-label", "Save name");
        yes.type = "submit";
        const no = document.createElement("button");
        no.textContent = "✕";
        no.setAttribute("aria-label", "Cancel rename");
        no.type = "button";
        const cancel = () => {
          editingId = null;
          render();
          list.querySelector(`[data-session-id="${item.id}"]`)?.focus();
        };
        no.onclick = cancel;
        input.onkeydown = (e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            cancel();
          }
        };
        form.onsubmit = (e) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          item.name = input.value.trim();
          item.renamed = true;
          editingId = null;
          persist();
          render();
          list.querySelector(`[data-session-id="${item.id}"]`)?.focus();
        };
        form.append(input, yes, no);
        row.append(form);
        list.append(row);
        continue;
      }
      const select = document.createElement("button");
      select.className = "session-select";
      select.dataset.sessionId = item.id;
      if (item.id === state.activeId)
        select.setAttribute("aria-current", "page");
      const icon = document.createElement("span");
      icon.className = "session-icon";
      icon.textContent = "JS";
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "session-label";
      const title = document.createElement("strong");
      title.textContent = item.name;
      select.title = item.name;
      const sub = document.createElement("small");
      sub.textContent =
        (item.linked ? item.fileName : "No file linked") +
        (item.code !== item.lastSaved ? " · Unsaved" : "");
      label.append(title, sub);
      select.append(icon, label);
      select.onclick = () => {
        closeActions();
        if (narrow.matches) menu(false);
        activate(item.id);
      };
      const more = document.createElement("button");
      more.className = "session-more";
      more.textContent = "⋯";
      more.setAttribute("aria-label", item.name + " actions");
      more.title = "Session actions";
      more.setAttribute("aria-haspopup", "true");
      more.onclick = () => {
        const popup = $("session-actions-popover");
        closeActions();
        actionsTrigger = more;
        popup.replaceChildren();
        const rename = document.createElement("button");
        rename.textContent = "Rename";
        rename.onclick = () => {
          closeActions();
          editingId = item.id;
          render();
          const input = list.querySelector(".session-rename input");
          input?.focus();
          input?.select();
        };
        const remove = document.createElement("button");
        remove.textContent = "Delete session";
        remove.className = "delete-action";
        remove.onclick = async () => {
          closeActions();
          if (
            !(await modal(
              "Delete “" +
                item.name +
                "”? The local JS file will not be deleted.",
              true,
              "Delete session",
            ))
          )
            return;
          capture();
          state.items = state.items.filter((s) => s.id !== item.id);
          codeEditor.forgetSession(item.id);
          saveHandle(item.id, null);
          if (!state.items.length) state.items.push(fresh("Session 1"));
          if (state.activeId === item.id)
            await activate(state.items[0].id, false);
          persist();
          render();
          $("session-new").focus();
        };
        popup.append(rename, remove);
        popup.showPopover();
        const rect = more.getBoundingClientRect();
        popup.style.left =
          Math.max(
            8,
            Math.min(
              innerWidth - popup.offsetWidth - 8,
              rect.right - popup.offsetWidth,
            ),
          ) + "px";
        popup.style.top =
          Math.max(
            8,
            Math.min(innerHeight - popup.offsetHeight - 8, rect.bottom + 4),
          ) + "px";
        rename.focus();
      };
      row.append(select, more);
      list.append(row);
    }
  }
  function controls(disabled) {
    restoring = disabled;
    codeEditor.setReadOnly(disabled);
    for (const id of ["run", "open-local", "save-local", "blank-template"])
      $(id).disabled = disabled;
  }
  async function missingFile(id, name) {
    const item = state.items.find((s) => s.id === id);
    if (!item) return;
    Object.assign(item, {
      code: template,
      lastSaved: template,
      hasHandle: false,
      baseline: null,
    });
    saveHandle(id, null);
    if (state.activeId === id) {
      fileBinding = null;
      codeEditor.setValue(template);
      lastSaved = template;
      lines();
      run();
      fileStatus(name + " · File missing · Drop it again");
    }
    persist();
    render();
    await modal(
      "Could not find the local file “" +
        name +
        "”. Drop the file again to reconnect it.\nThis session now shows a blank template.",
      false,
      "File not found",
    );
  }
  async function activate(id, saveCurrent = true) {
    if (saveCurrent) capture();
    const item = state.items.find((s) => s.id === id);
    if (!item) return;
    const token = ++activation;
    controls(true);
    clearTimeout(timer);
    state.activeId = id;
    fileBinding = null;
    fileName = item.fileName || "sketch.js";
    codeEditor.switchSession(id, item.code);
    lastSaved = item.lastSaved ?? item.code;
    $("live").checked = item.live !== false;
    setSplit(item.split ?? 0.5);
    lines();
    render();
    persist();
    let issue = null;
    try {
      if (item.hasHandle) {
        const handle = handles.get(id) || (await handleOperation("get", id));
        if (token !== activation) return;
        if (!handle) {
          issue =
            "Could not restore the file association for “" +
            fileName +
            "”. Please drop the file again.";
        } else {
          handles.set(id, handle);
          fileBinding = {
            handle,
            saved: item.baseline ?? item.lastSaved,
            sessionId: id,
          };
          const permission = await handle.queryPermission({ mode: "read" });
          if (token !== activation) return;
          if (permission === "granted") await handle.getFile();
          else
            issue =
              "Permission is needed to access “" +
              fileName +
              "”. Your code has been restored. Click Save JS to grant access, or drop the file again.";
        }
      }
    } catch (error) {
      if (token !== activation) return;
      if (error.name === "NotFoundError") {
        controls(false);
        await missingFile(id, item.fileName);
        return;
      }
      issue =
        "Unable to access “" +
        fileName +
        "”. Grant access again or drop the file here.";
    }
    if (token !== activation) return;
    controls(false);
    run();
    fileStatus(
      item.linked
        ? item.fileName +
            (item.code === item.lastSaved
              ? " · Restored"
              : " · Unsaved changes")
        : "No file linked",
    );
    if (issue) modal(issue, false, "File access");
  }
  window.sessions = {
    get activeId() {
      return state.activeId;
    },
    get busy() {
      return restoring;
    },
    capture,
    detach,
    bound,
    recordedSave,
    modal,
    missingFile,
    activate,
  };
  $("sessions-toggle").onclick = () => menu($("sessions-menu").hidden);
  $("sessions-close").onclick = () => {
    menu(false);
    $("sessions-toggle").focus();
  };
  $("sessions-shade").onclick = () => menu(false);
  document.addEventListener("keydown", (e) => {
    if ($("session-dialog").open) return;
    if (e.key === "Escape") {
      if ($("session-actions-popover").matches(":popover-open")) {
        closeActions();
        return;
      }
      if (
        !$("sessions-menu").hidden &&
        (narrow.matches || $("sessions-menu").contains(document.activeElement))
      )
        menu(false);
    }
    if (
      e.key === "Tab" &&
      narrow.matches &&
      !$("sessions-menu").hidden &&
      !$("session-actions-popover").matches(":popover-open")
    ) {
      const targets = [
        ...$("sessions-menu").querySelectorAll("button,input"),
      ].filter((el) => !el.disabled && el.offsetParent !== null);
      const first = targets[0],
        last = targets.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
  $("session-actions-popover").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeActions();
      actionsTrigger?.focus();
    }
  });
  $("session-search").oninput = () => {
    editingId = null;
    closeActions();
    render();
  };
  $("session-new").onclick = () => {
    capture();
    const item = fresh("Session " + (state.items.length + 1));
    state.items.push(item);
    $("session-search").value = "";
    if (narrow.matches) menu(false);
    activate(item.id);
  };
  $("blank-template").onclick = async () => {
    const id = state.activeId;
    if (
      !(await modal(
        "Reset the current session to a blank template? This action cannot be undone.",
        true,
      ))
    )
      return;
    if (state.activeId !== id) return;
    resetFileBinding();
    codeEditor.setValue(template);
    lastSaved = template;
    capture();
    render();
    lines();
    run();
  };
  window.addEventListener("beforeunload", (e) => {
    capture();
    if (!storageOK || pendingHandles) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") capture();
  });
  menu(state.sidebarOpen ?? !narrow.matches, false);
  activate(state.activeId, false);
})();
