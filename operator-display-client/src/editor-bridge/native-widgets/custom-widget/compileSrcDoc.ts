import { transform } from "@babel/standalone";
import { compileString } from "sass";
import type { CustomSrcDoc } from "./customWidgetModel";

export interface CompileResult {
  code: CustomSrcDoc;
  warnings: Array<{ message: string }>;
  errors: Array<{ message: string }>;
}

// Appsmith CustomWidgetBuilder/utility.ts compileSrcDoc, kept separate from
// the runtime renderer so its Babel and Sass dependencies are loaded only by
// a source editor.
export function compileSrcDoc(srcDoc: CustomSrcDoc): CompileResult {
  const result: CompileResult = { code: { ...srcDoc }, warnings: [], errors: [] };
  if (srcDoc.js.length > 0 &&
    !srcDoc.js.match(/appsmith[\n\t\s]*\.[\n\t\s]*onReady[\n\t\s]*\(/)) {
    result.warnings.push({ message: "Call appsmith.onReady before initializing the custom widget." });
  }
  try {
    result.code.js = transform(srcDoc.js, {
      sourceType: "module",
      presets: ["react"],
      targets: { esmodules: true },
    }).code || "";
  } catch (error) {
    result.errors.push({ message: String(error) });
  }
  try {
    result.code.css = compileString(srcDoc.css).css || "";
  } catch (error) {
    result.warnings.push({ message: String(error) });
  }
  return result;
}
