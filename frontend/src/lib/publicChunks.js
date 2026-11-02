// Code chunks that are useful before a route is known. A landing-page button can
// start the login chunk on hover/focus without importing the page into the entry.
export const loginChunk = () => import("../pages/auth/LoginPage");
