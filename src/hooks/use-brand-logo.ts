'use client';

import { useEffect, useState } from 'react';

let cachedLogoUrl: string | null | undefined;

/**
 * Account's branding logo (Settings → Branding), used as the fallback
 * avatar for contacts without a photo — WhatsApp's Cloud API never
 * exposes customer profile pictures, so every inbox contact would
 * otherwise fall back to a bare initial.
 */
export function useBrandLogo(): string | null {
  const [logoUrl, setLogoUrl] = useState<string | null>(cachedLogoUrl ?? null);

  useEffect(() => {
    if (cachedLogoUrl !== undefined) return;
    fetch('/api/brand')
      .then((r) => r.json())
      .then((data) => {
        const url: string | null = data?.logo_url || null;
        cachedLogoUrl = url;
        setLogoUrl(url);
      })
      .catch(() => {
        cachedLogoUrl = null;
      });
  }, []);

  return logoUrl;
}
