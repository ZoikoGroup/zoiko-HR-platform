/**
 * The signed-in route table moved out of src/App.jsx into
 * src/routes/PortalApp.jsx so public visitors do not download it. Tests that
 * assert a route is registered should read both files: public routes live in
 * App.jsx, portal routes in PortalApp.jsx.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

export const appSource = read("src/App.jsx");
export const portalSource = read("src/routes/PortalApp.jsx");
export const routeSource = `${appSource}\n${portalSource}`;
