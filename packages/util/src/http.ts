let logFetchRedirect: RequestRedirect = "error";

/**
 * Let log fetches follow redirects. Only for a host whose
 * Content-Security-Policy bounds where a redirect can land, like a Hugging
 * Face Space bundle: the Space answers every log read with a redirect to the
 * HF CDN, and the bundle's `connect-src` names only itself and HF hosts.
 */
export const allowLogFetchRedirects = (): void => {
  logFetchRedirect = "follow";
};

/**
 * Request options for every fetch the browser issues directly to a log
 * location. That location is data (a link param, a listing entry, a
 * server-supplied direct URL), not the page's own origin: it gets no
 * referrer, no cross-origin credentials, and no redirect to a destination
 * other than the one that was named (unless the host opted in with
 * `allowLogFetchRedirects`). `redirect` is a getter so a spread copy reads
 * the current setting.
 */
export const logFetchInit = Object.freeze({
  credentials: "same-origin",
  referrerPolicy: "no-referrer",
  get redirect(): RequestRedirect {
    return logFetchRedirect;
  },
}) satisfies RequestInit;

/**
 * Fetches a range of bytes from a remote resource and returns it as a `Uint8Array`.
 */
export const fetchRange = async (
  url: string,
  start: number,
  end: number
): Promise<Uint8Array> => {
  const response = await fetch(url, {
    ...logFetchInit,
    headers: { Range: `bytes=${start}-${end}` },
  });
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};
