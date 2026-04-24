type RouteHandler = (params?: Record<string, string>) => void;

const routes: Record<string, RouteHandler> = {};

export function on(path: string, fn: RouteHandler) {
  routes[path] = fn;
}

export function navigate(path: string) {
  history.pushState({}, "", path);
  dispatch(path);
}

function dispatch(path: string) {
  const handler = routes[path] ?? routes["/404"] ?? routes["/"];
  handler?.();
}

window.addEventListener("popstate", () => dispatch(location.pathname));
document.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a[data-link]");
  if (!a) return;
  e.preventDefault();
  navigate((a as HTMLAnchorElement).getAttribute("href")!);
});

export function start() {
  dispatch(location.pathname);
}
