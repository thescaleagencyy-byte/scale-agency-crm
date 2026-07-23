import type { MetadataRoute } from 'next'

const clientName = process.env.NEXT_PUBLIC_CLIENT_NAME
const appName = clientName ? `${clientName} Dashboard` : 'Scale OS'
const icon = clientName ? `/clients/${clientName.toLowerCase().replace(/\s+/g, '')}.png` : '/icon.png'

// Makes the app installable to a phone homescreen (Add to Home
// Screen / "Install app") — no native app build, no app store
// review, just this file. Covers the "SMB owner lives on their
// phone" gap without the cost of iOS/Android native development.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appName,
    short_name: appName,
    description: `${appName} — powered by The Scale Agency`,
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#020617',
    icons: [
      { src: icon, sizes: '512x512', type: 'image/png' },
      { src: icon, sizes: '192x192', type: 'image/png' },
    ],
  }
}
