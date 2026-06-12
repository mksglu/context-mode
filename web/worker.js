// context-mode.com router — Master at /, OSS at /oss, Insight at /insight.
//
//   web/index.html    → served at /          (Context Mode master landing)
//   web/oss.html      → served at /oss       (OSS plugin marketing)
//   web/insight.html  → served at /insight   (Insight Solution marketing)
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
    if (path === "/oss") {
      return env.ASSETS.fetch(new Request(new URL("/oss.html", url), req));
    }
    if (path === "/insight") {
      return env.ASSETS.fetch(new Request(new URL("/insight.html", url), req));
    }
    return env.ASSETS.fetch(req);
  }
};
