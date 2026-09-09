/**
 * __tests__/support/jsx-loader.mjs
 * ---------------------------------
 * Node ESM loader hooks that let plain `node --test` import .jsx source
 * files directly, the way Vite does at dev/build time. Node's native loader
 * has neither: (1) a JSX transform, nor (2) Vite's implicit-extension
 * resolution (this codebase's components import siblings as
 * `"../Foo"` / `"../../components/Bar"` with no extension, relying on the
 * bundler to find `Bar.jsx`).
 *
 * Registered via __tests__/support/register-hooks.mjs (see `node --import`
 * in package.json's "test" script). Only used for component tests — the
 * existing pure-logic *.test.mjs files never hit a relative import that
 * needs this, so this is additive and safe for the rest of the suite.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const EXTENSIONLESS_CANDIDATES = [".jsx", ".js", ".mjs"];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".")) {
      throw err;
    }
    for (const ext of EXTENSIONLESS_CANDIDATES) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {
        // try the next candidate extension
      }
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  const pathname = url.split("?")[0].split("#")[0];
  if (pathname.endsWith(".jsx")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const { code } = esbuild.transformSync(source, {
      loader: "jsx",
      jsx: "automatic",
      format: "esm",
      sourcefile: url,
    });
    return { format: "module", source: code, shortCircuit: true };
  }
  if (pathname.endsWith(".svg")) {
    // Mirrors Vite's asset handling: an SVG import resolves to its URL string.
    // Without this, probing the real file for a module format throws
    // ERR_UNKNOWN_FILE_EXTENSION before the file is ever read.
    return { format: "module", source: "export default '';", shortCircuit: true };
  }
  return nextLoad(url, context);
}
