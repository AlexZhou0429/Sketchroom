# Sketchroom

An offline-friendly p5.js studio for visual experiments. Write JavaScript on one side and see the result on the other.

![Sketchroom editor and preview](docs/screenshot.png)

## Start

Download the repository, extract it, and open **index.html** in a desktop browser. Keep the whole folder together. No account, build step, server, or internet connection is required for the bundled editor and p5.js library.

Desktop Chrome or Edge offers the most complete local-file workflow. Other browsers can use download-based saving when direct file access is unavailable.

## Make a sketch

- Start with the blank canvas, or use **Open JS** / drag a `.js` file into the window.
- Edit the code. **Live preview** restarts the sketch after a short pause in typing. Turn it off to run manually.
- Click **Save JS** to save. New sketches ask for a location; linked files are written back after you grant permission. If the browser cannot retain the dropped file's handle, select the destination on the first save.
- Use **Sessions** to create, search, switch, rename, or delete sessions. Each session keeps its own code and file association.

Sessions are saved in this browser automatically. This is separate from saving the actual `.js` file: use **Save JS** for that. Refreshing restores the current session and restarts the sketch, rather than restoring an animation frame.

## Editor and workspace

- JavaScript highlighting, automatic bracket/quote pairing, indentation, completion, and independent undo histories for open sessions.
- Red underlines for syntax errors and yellow underlines for potential issues. Hover to read the diagnostic. The checker knows the bundled p5.js API.
- Resizable code/preview split, independent fullscreen panes, and a collapsible console that retains the latest 50 messages and follows new output.
- A compact session sidebar on desktop and a drawer on smaller screens.

| Shortcut           | Action                       |
| ------------------ | ---------------------------- |
| Cmd / Ctrl + Enter | Run                          |
| Cmd / Ctrl + S     | Save JS                      |
| Tab / Shift + Tab  | Indent / outdent             |
| Cmd / Ctrl + /     | Toggle comment               |
| Ctrl + Space       | Show completions             |
| Esc in the editor  | Move focus out of the editor |

**Blank template** resets only the current session after confirmation and disconnects its file association. It does not overwrite the original file. Deleting a session also leaves its local file untouched.

## Storage and files

Session data lives in localStorage; supported file handles live in IndexedDB. Use the same browser and page location to restore them. Clearing browser data, private browsing, moving the folder, or switching between `file://` and a hosted address can change or remove this storage.

File permissions may need renewal after reopening the browser. A missing linked file produces a prompt and a blank template; drop the file again to reconnect it. Permission problems preserve the restored code. If another app changes the file, saving stops rather than silently overwriting that change.

The app has no backend, analytics, account system, or built-in uploads. Sketches themselves are JavaScript: they may access the network or use browser APIs. Run code you trust. The preview iframe is for execution reset and layout, not a security boundary for hostile code.

Only JavaScript is imported. Sketches using local images, fonts, modules, or other assets may need a local server and appropriate paths. The editor does not bundle those assets. Static linting is not a complete JavaScript or runtime verifier; runtime errors appear in the console. An infinite loop can still freeze the browser tab.

## Development

The application is static HTML, CSS, and JavaScript. Dependencies needed by the app are checked into `vendor/`. Node.js is only needed for development checks.

```sh
npm ci
npx playwright install chromium
npm run check
npm test
npm run format:check
```

The tests use an isolated browser context and a temporary local HTTP server. File-handle persistence tests use the browser's native origin-private file system, not personal files or OS permission dialogs.

| File          | Responsibility                                         |
| ------------- | ------------------------------------------------------ |
| `app.js`      | Preview lifecycle, imports, split, fullscreen, console |
| `editor.js`   | CodeMirror, completion, diagnostics, editor documents  |
| `files.js`    | Local file reading, saving, permission handling        |
| `sessions.js` | Session persistence, navigation, dialogs               |
| `runner.html` | Fresh p5.js execution environment for each run         |

## Put it on GitHub

Create an empty repository named **sketchroom** on your GitHub account. In this local repository, run:

```sh
git remote add origin https://github.com/YOUR_USERNAME/sketchroom.git
git push -u origin main
```

No GitHub repository or remote is created automatically. The code can also be served by a static host such as GitHub Pages. Browser sessions belong to the page origin, so local-file sessions do not transfer automatically to a hosted copy.

## License

Sketchroom's original code is MIT licensed. Bundled libraries have their own licenses, including p5.js under LGPL-2.1. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
