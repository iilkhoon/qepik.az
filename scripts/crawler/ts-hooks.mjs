// Node module hooks that let the standalone crawler import the Worker's lib/*.ts adapters
// unchanged: extensionless relative imports resolve to .ts, .ts is transpiled with TypeScript,
// and .json imports get the required import attribute.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export async function resolve(specifier, context, next) {
  const parent = context.parentURL || "";
  if (
    parent.endsWith(".ts") &&
    /^\.\.?\//.test(specifier) &&
    !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)
  ) {
    const candidate = new URL(specifier + ".ts", parent);
    if (fs.existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith(".json"))
    return {
      format: "module",
      source: "export default " + fs.readFileSync(fileURLToPath(url), "utf8") + ";",
      shortCircuit: true,
    };
  if (url.endsWith(".ts")) {
    const source = fs.readFileSync(fileURLToPath(url), "utf8");
    const out = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: false,
        isolatedModules: true,
      },
    }).outputText;
    return { format: "module", source: out, shortCircuit: true };
  }
  return next(url, context);
}
