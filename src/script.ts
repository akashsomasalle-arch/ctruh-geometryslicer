import homeHtml from "./home/home.html?raw";
import editorHtml from "./editor/editor.html?raw";
import { initHome, type HomeApi } from "./home/home";
import type { App } from "./editor/core/App";

type RouteName = "home" | "editor";

const ROUTES: Record<string, RouteName> = {
  "/": "home",
  "/home": "home",
  "/editor": "editor",
};

interface View {
  el: HTMLElement;
  html: string;
  loaded: boolean;
  api: HomeApi | App | null;
}

const views: Record<RouteName, View> = {
  home: {
    el: document.querySelector("#route-home") as HTMLElement,
    html: homeHtml,
    loaded: false,
    api: null,
  },
  editor: {
    el: document.querySelector("#route-editor") as HTMLElement,
    html: editorHtml,
    loaded: false,
    api: null,
  },
};

function normalizePath(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "/home";
  return ROUTES[path] ? path : "/home";
}

function viewName(pathname: string): RouteName {
  return ROUTES[normalizePath(pathname)] || "home";
}

function pathFromHash(hash: string): string {
  return normalizePath(hash.replace(/^#/, "") || "/");
}

function pathFromLocation(): string {
  if (window.location.hash) return pathFromHash(window.location.hash);

  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const leaf = path === "/" ? "/" : `/${path.split("/").pop()}`;
  return normalizePath(ROUTES[leaf] ? leaf : "/home");
}

function routeHref(path: string): string {
  const url = new URL(window.location.href);
  url.hash = normalizePath(path);
  return url.href;
}

export function navigate(path: string, replace = false): Promise<void> {
  const next = normalizePath(path);
  const href = routeHref(next);
  if (href !== window.location.href) {
    if (replace) history.replaceState({}, "", href);
    else history.pushState({}, "", href);
  }
  return render(next);
}

async function render(path: string): Promise<void> {
  const name = viewName(path);

  for (const [key, view] of Object.entries(views)) {
    view.el.hidden = key !== name;
  }

  await mount(name);

  for (const [key, view] of Object.entries(views)) {
    view.api?.setActive?.(key === name);
  }

  document.title = name === "editor" ? "Ctruh: Geometry Slicer - Editor" : "Ctruh: Geometry Slicer";

  if (name === "editor") {
    requestAnimationFrame(() => (views.editor.api as App | null)?.sceneManager?.resize());
  }
}

async function mount(name: RouteName): Promise<void> {
  const view = views[name];
  if (view.loaded) return;

  view.el.innerHTML = view.html;
  view.loaded = true;

  if (name === "home") {
    view.api = initHome(view.el.querySelector("#home"), {
      onStart: () => navigate("/editor"),
    });
    return;
  }

  const { initEditor } = await import("./editor/editor");
  view.api = initEditor();
}

function routeFromLink(link: HTMLAnchorElement): string | null {
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return null;

  if (url.hash) {
    const path = pathFromHash(url.hash);
    return ROUTES[path] ? path : null;
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  const leaf = path === "/" ? "/" : `/${path.split("/").pop()}`;
  return ROUTES[leaf] ? normalizePath(leaf) : null;
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const link = target.closest("a[href]");
  if (!link || event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!(link instanceof HTMLAnchorElement)) return;

  const path = routeFromLink(link);
  if (!path) return;

  event.preventDefault();
  navigate(path);
});

window.addEventListener("hashchange", () => {
  render(pathFromLocation());
});

window.addEventListener("popstate", () => {
  render(pathFromLocation());
});

navigate("/home", true);
