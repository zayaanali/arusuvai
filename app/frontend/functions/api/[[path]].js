function trimSlash(value) {
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function toBackendUrl(requestUrl, env) {
  const backendOrigin = trimSlash(env.BACKEND_ORIGIN || "");
  if (!backendOrigin) {
    return { error: "BACKEND_ORIGIN is not set" };
  }

  const backendPrefixRaw = env.BACKEND_API_PREFIX || "";
  const backendPrefix = backendPrefixRaw
    ? `/${backendPrefixRaw.replace(/^\/+|\/+$/g, "")}`
    : "";

  const incoming = new URL(requestUrl);
  let proxiedPath = incoming.pathname || "/";
  if (backendPrefix) {
    proxiedPath = proxiedPath.replace(/^\/api(?=\/|$)/, "") || "/";
  }
  if (!proxiedPath.startsWith("/")) proxiedPath = `/${proxiedPath}`;

  const target = new URL(`${backendOrigin}${backendPrefix}${proxiedPath}`);
  target.search = incoming.search;
  return { url: target.toString() };
}

export async function onRequest(context) {
  const { request, env } = context;
  const backend = toBackendUrl(request.url, env);
  if (backend.error) {
    return new Response(JSON.stringify({ error: backend.error }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", new URL(request.url).host);
  headers.set("x-forwarded-proto", "https");
  if (env.BACKEND_SHARED_SECRET) {
    headers.set("X-Backend-Secret", env.BACKEND_SHARED_SECRET);
  }
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers.set("CF-Access-Client-Id", env.CF_ACCESS_CLIENT_ID);
    headers.set("CF-Access-Client-Secret", env.CF_ACCESS_CLIENT_SECRET);
  }

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
  };

  return fetch(backend.url, init);
}
