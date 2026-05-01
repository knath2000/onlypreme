const DEFAULT_PRODUCTION_ORIGIN = "https://onlypreme.vercel.app";

function normalizeOrigin(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  const withProtocol = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

export function getProductionSiteOrigin() {
  const explicitOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (explicitOrigin) return explicitOrigin;

  if (process.env.VERCEL_ENV === "production") {
    return normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) || DEFAULT_PRODUCTION_ORIGIN;
  }

  return null;
}

export function getSiteOrigin(requestUrl: string | URL) {
  return getProductionSiteOrigin() || new URL(requestUrl).origin;
}

export function canonicalUrlForRequest(requestUrl: string | URL) {
  const productionOrigin = getProductionSiteOrigin();
  if (!productionOrigin) return null;

  const currentUrl = new URL(requestUrl);
  const productionUrl = new URL(productionOrigin);

  if (currentUrl.hostname === productionUrl.hostname) return null;
  if (currentUrl.hostname === "localhost" || currentUrl.hostname === "127.0.0.1") return null;

  currentUrl.protocol = productionUrl.protocol;
  currentUrl.host = productionUrl.host;
  return currentUrl;
}

export function safeRelativePath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
