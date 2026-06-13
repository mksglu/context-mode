// context-mode.com router — Master at /, Context Saving at /context-saving, Insight at /insight.
//
//   web/index.html              → served at /                  (Context Mode master landing)
//   web/context-saving.html     → served at /context-saving    (Context Saving plugin marketing)
//   web/insight.html            → served at /insight           (Insight Solution marketing)
//
// /oss is preserved as a 301 redirect to /context-saving for backwards compatibility.
//
// platform.context-mode.com is the SPA app (separate deployment) — sign-in /
// dashboard. This worker only handles marketing routing + asset fallthrough.

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), req));
    }
    if (path === "/context-saving") {
      return env.ASSETS.fetch(new Request(new URL("/context-saving.html", url), req));
    }
    if (path === "/oss") {
      return Response.redirect(new URL("/context-saving" + url.search, url), 301);
    }
    if (path === "/insight") {
      return env.ASSETS.fetch(new Request(new URL("/insight.html", url), req));
    }
    return env.ASSETS.fetch(req);
  }
};
