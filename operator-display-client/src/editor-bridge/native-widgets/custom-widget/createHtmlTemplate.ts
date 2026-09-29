import appsmithConsole from "./appsmithConsole.js?raw";
import resetCss from "./reset.css?raw";
import script from "./customWidgetscript.js?raw";
import type { CustomSrcDoc } from "./customWidgetModel";

// Direct Fixed CustomWidget/component/index.tsx srcDoc template. The iframe's
// sandbox omits allow-same-origin, as the Appsmith source does.
export function createHtmlTemplate(srcDoc: CustomSrcDoc, onConsole: boolean): string {
  return `
    <html translate="no">
      <head>
        <style>${resetCss}</style>
      </head>
      <body>
        <script type="text/javascript">${onConsole ? appsmithConsole : ""}</script>
        <script type="module">${script}\nmain();</script>
        ${srcDoc.html}
        <script type="module">${srcDoc.js}</script>
        <style>${srcDoc.css}</style>
      </body>
    </html>
  `;
}
