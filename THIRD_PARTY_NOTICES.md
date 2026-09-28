# Third-party software

The root MIT license covers Sketchroom's original application code and documentation. It does not replace the licenses of bundled dependencies.

| Component  | Version | License  | Local notice                                           | Upstream                                                               |
| ---------- | ------- | -------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| p5.js      | 1.11.11 | LGPL-2.1 | [vendor/LICENSE.txt](vendor/LICENSE.txt)               | [p5.js source](https://github.com/processing/p5.js/tree/v1.11.11)      |
| CodeMirror | 5.65.21 | MIT      | [vendor/codemirror/LICENSE](vendor/codemirror/LICENSE) | [CodeMirror 5](https://github.com/codemirror/codemirror5/tree/5.65.21) |
| JSHint     | 2.13.6  | MIT      | [vendor/jshint/LICENSE](vendor/jshint/LICENSE)         | [JSHint](https://github.com/jshint/jshint/tree/2.13.6)                 |

These libraries are bundled unmodified from their npm distributions through jsDelivr. Keep their notices when sharing the app. `vendor/p5-globals.js` is a generated list of public identifiers from the bundled p5.js runtime, used for completion and linting.

The application loads p5.js as a separate, replaceable script. Its corresponding upstream source is linked above. This project is independent of the p5.js, CodeMirror, and JSHint projects.
