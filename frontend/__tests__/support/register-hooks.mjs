/**
 * __tests__/support/register-hooks.mjs
 * --------------------------------------
 * Bootstrap loaded via `node --import` (see package.json's "test" script).
 * Registers the JSX/extensionless-import loader so component tests can
 * `import Foo from "../src/.../Foo.jsx"` directly under plain node --test.
 */
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);
