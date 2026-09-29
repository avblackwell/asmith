"use strict";

const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  const backendUrl = process.env.APPSMITH_BACKEND_URL;

  // Leave the existing nginx-based development setup unchanged by default.
  if (!backendUrl) {
    return;
  }

  const backend = new URL(backendUrl);

  if (
    !["http:", "https:"].includes(backend.protocol) ||
    backend.username ||
    backend.password ||
    backend.pathname !== "/" ||
    backend.search ||
    backend.hash
  ) {
    throw new Error("APPSMITH_BACKEND_URL must be an HTTP(S) origin.");
  }

  app.use(
    createProxyMiddleware(
      (pathname) => /^\/(api|oauth2|login|rts)(\/|$)/.test(pathname),
      {
        target: backend.origin,
        changeOrigin: true,
        secure: true,
        ws: true,
        xfwd: true,
        // Keep upstream sessions and redirects on this development origin.
        cookieDomainRewrite: "",
        autoRewrite: true,
        protocolRewrite: process.env.HTTPS === "true" ? "https" : "http",
        logLevel: "silent",
        onProxyReq(proxyReq, req) {
          proxyReq.setHeader("X-Forwarded-Host", req.headers.host);
          proxyReq.setHeader(
            "X-Forwarded-Proto",
            req.socket.encrypted ? "https" : "http",
          );
        },
        onError(_error, _req, res) {
          if (typeof res.writeHead === "function") {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Cannot reach APPSMITH_BACKEND_URL. Check the backend and restart the development server.",
              }),
            );
          } else {
            res.end();
          }
        },
      },
    ),
  );
};
