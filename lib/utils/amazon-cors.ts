const AMAZON_HOSTS = new Set(['www.amazon.ca', 'amazon.ca'])

export function getAmazonCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {}

  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' || !AMAZON_HOSTS.has(url.hostname)) {
      return {}
    }

    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    }
  } catch {
    return {}
  }
}
