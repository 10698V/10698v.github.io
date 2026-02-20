// SPA router: swaps #app-shell without a full reload. HTML prefetch is disabled to avoid stale markup;
// styles are always cloned from the fetched document to ensure route-scoped CSS is present on soft nav.

type RouteName = "home" | "team";

type NavigateOptions = {
  fromHero?: boolean;
  fromTeam?: boolean;
  replaceState?: boolean;
};

const cache = new Map<string, string>();
let isNavigating = false;
let routerBooted = false;
let linkListenerBound = false;

const normalizePath = (pathname: string) => {
  if (!pathname) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
};

const isHomeRoute = (pathname: string) => pathname === "/" || pathname === "/index.html";
const isTeamRoute = (pathname: string) =>
  pathname === "/team" || pathname === "/team/" || pathname === "/team/index.html";

const cacheKeysForPath = (pathname: string, search = "") => {
  const path = normalizePath(pathname);
  const searchPart = search || "";
  const keys = new Set<string>();
  const withSearch = (value: string) => `${value}${searchPart}`;
  keys.add(withSearch(path));
  if (path === "/") {
    keys.add(withSearch("/index.html"));
  } else {
    const withSlash = path.endsWith("/") ? path : `${path}/`;
    keys.add(withSearch(withSlash));
    keys.add(withSearch(`${withSlash}index.html`));
    keys.add(withSearch(`${path}/index.html`));
  }
  return Array.from(keys);
};

const setCache = (pathname: string, html: string, search = "") => {
  cacheKeysForPath(pathname, search).forEach((key) => cache.set(key, html));
};

const getCache = (pathname: string, search = "") => {
  for (const key of cacheKeysForPath(pathname, search)) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  return null;
};

const getRouteName = (pathname: string): RouteName | null => {
  if (isHomeRoute(pathname)) return "home";
  if (isTeamRoute(pathname)) return "team";
  return null;
};

const getShellElement = () => document.getElementById("app-shell");

const extractDocument = (html: string) => {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
};

const STYLE_SELECTOR = "style";
const LINK_SELECTOR = 'link[rel="stylesheet"][href]';

const syncHead = (doc: Document) => {
  const newHead = doc.head;
  const currentHead = document.head;
  if (!newHead || !currentHead) return;

  const existingLinkHrefs = new Set(
    Array.from(currentHead.querySelectorAll<HTMLLinkElement>(LINK_SELECTOR)).map(
      (el) => el.getAttribute("href") || "",
    ),
  );

  newHead.querySelectorAll<HTMLStyleElement>(STYLE_SELECTOR).forEach((styleEl) => {
    const clone = styleEl.cloneNode(true) as HTMLStyleElement;
    currentHead.appendChild(clone);
  });

  newHead.querySelectorAll<HTMLLinkElement>(LINK_SELECTOR).forEach((linkEl) => {
    const href = linkEl.getAttribute("href") || "";
    if (!href || existingLinkHrefs.has(href)) return;
    const clone = linkEl.cloneNode(true) as HTMLLinkElement;
    currentHead.appendChild(clone);
    existingLinkHrefs.add(href);
  });
};

const extractShellHtml = (html: string) => {
  const doc = extractDocument(html);
  if (typeof document !== "undefined") {
    syncHead(doc);
  }
  const shell = doc.getElementById("app-shell");
  return {
    html: shell ? shell.innerHTML : doc.body.innerHTML,
    title: doc.title || document.title,
  };
};

async function runPageInit(pathname: string, opts?: NavigateOptions) {
  const route = getRouteName(pathname);
  if (route === "home") {
    const mod = await import("../scripts/home-init.ts");
    mod.initHomePage({ fromTeam: !!opts?.fromTeam });
  } else if (route === "team") {
    const mod = await import("../scripts/team-init.ts");
    mod.initTeamPage({ fromHero: !!opts?.fromHero });
  }
}

const seedInitialCache = () => {
  const path = normalizePath(window.location.pathname);
  const search = window.location.search;
  if (!cache.size) {
    setCache(path, document.documentElement.outerHTML, search);
  }
};

async function loadRouteHtml(url: URL): Promise<string> {
  const pathname = normalizePath(url.pathname);
  const search = url.search;

  const cached = getCache(pathname, search);
  if (cached) return cached;

  const res = await fetch(`${pathname}${search}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Failed to load ${pathname}${search}`);
  const text = await res.text();
  setCache(pathname, text, search);
  return text;
}

const updateBodyRoute = (pathname: string) => {
  if (document.body) {
    document.body.dataset.route = pathname;
  }
};

const handleLinkClick = (event: MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const anchor = (event.target as HTMLElement | null)?.closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return;
  if (anchor.target && anchor.target !== "_self") return;
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) return;

  const route = getRouteName(url.pathname);
  if (!route) return;

  event.preventDefault();
  navigateSoft(url.pathname + url.search).catch(() => {
    window.location.href = url.href;
  });
};

export async function navigateSoft(href: string, opts: NavigateOptions = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    window.location.href = href;
    return;
  }
  if (isNavigating) return;

  const url = new URL(href, window.location.href);
  const pathname = normalizePath(url.pathname);
  const search = url.search;
  const shell = getShellElement();

  if (!shell) {
    window.location.href = href;
    return;
  }

  try {
    isNavigating = true;
    const html = await loadRouteHtml(url);
    const { html: shellHtml, title } = extractShellHtml(html);

    document.dispatchEvent(new CustomEvent("astro:before-swap"));

    // Definitive Flash Fix: Add class BEFORE content swap to ensure CSS hides it immediately
    if (opts.fromHero) {
      document.documentElement.classList.add("hero-transition");
    }

    shell.innerHTML = shellHtml;
    document.title = title;
    updateBodyRoute(pathname);
    const stateMethod = opts.replaceState ? "replaceState" : "pushState";
    window.history[stateMethod]({}, "", `${url.pathname}${search}`);
    window.scrollTo({ top: 0, behavior: "auto" });

    document.dispatchEvent(new CustomEvent("astro:after-swap"));

    await runPageInit(pathname, opts);
    document.dispatchEvent(new CustomEvent("astro:page-load"));
  } catch (err) {
    console.warn("[spa-router] Soft nav failed, falling back to full navigation", err);
    window.location.href = href;
  } finally {
    isNavigating = false;
  }
}

export function bootSpaRouter() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (routerBooted) return;
  routerBooted = true;

  seedInitialCache();
  void runPageInit(window.location.pathname);

  window.addEventListener("popstate", () => {
    navigateSoft(window.location.pathname + window.location.search, { replaceState: true }).catch(() => {
      window.location.reload();
    });
  });

  if (!linkListenerBound) {
    document.addEventListener("click", handleLinkClick);
    linkListenerBound = true;
  }
}
