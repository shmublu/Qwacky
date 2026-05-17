(navigator as any).duckduckgo ??= {};

// Page-origin token sniffer. Runs in MAIN world at document_start so we can
// observe the bearer token that quack.duckduckgo.com returns to the page after
// the user signs in / signs up. Patched globals are restored as soon as the
// first token is captured, so any other script in the page origin only has a
// one-request window to read the postMessage broadcast.

const originalFetch = window.fetch;
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

let captured = false;

const restoreOriginals = () => {
  window.fetch = originalFetch;
  XMLHttpRequest.prototype.open = originalOpen;
  XMLHttpRequest.prototype.send = originalSend;
};

const postToken = (data: any) => {
  if (captured || !data?.token) return;
  captured = true;
  // Username from the API response is authoritative; do not trust query strings.
  const username = typeof data?.user?.username === 'string' ? data.user.username : '';
  window.postMessage(
    { type: 'qwacky-auth-token', token: data.token, username },
    window.location.origin
  );
  restoreOriginals();
};

window.fetch = async function (...args: Parameters<typeof fetch>) {
  const response = await originalFetch.apply(this, args);
  const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url;
  if (!captured && url && url.includes('quack.duckduckgo.com')) {
    try {
      const data = await response.clone().json();
      postToken(data);
    } catch {}
  }
  return response;
};

XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
  (this as any)._qwackyUrl = typeof url === 'string' ? url : url.toString();
  return originalOpen.apply(this, [method, url, ...rest] as any);
};

XMLHttpRequest.prototype.send = function (...args: any[]) {
  const url = (this as any)._qwackyUrl as string | undefined;
  if (!captured && url && url.includes('quack.duckduckgo.com')) {
    this.addEventListener('load', function () {
      try { postToken(JSON.parse(this.responseText)); } catch {}
    });
  }
  return originalSend.apply(this, args as any);
};

export {};
