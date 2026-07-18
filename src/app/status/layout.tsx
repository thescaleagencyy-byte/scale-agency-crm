// ============================================================
// /status/[accountId] layout — minimal public shell, no sidebar.
//
// Sits outside (auth) and (dashboard) for the same reason as
// /join/[token]: it must render for anonymous visitors, and
// reusing the dashboard layout would funnel them through the
// login redirect.
// ============================================================

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function StatusLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {children}
    </div>
  );
}
