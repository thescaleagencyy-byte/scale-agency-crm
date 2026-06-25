'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LeadsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState('loading...');

  useEffect(() => {
    supabase
      .from('leads')
      .select('id', { count: 'exact' })
      .limit(1)
      .then(({ data, count, error }) => {
        if (error) setStatus(`ERROR: ${error.message}`);
        else setStatus(`OK — ${count ?? 0} leads found`);
      })
      .catch((e: unknown) => setStatus(`CRASH: ${String(e)}`));
  }, [supabase]);

  return (
    <div style={{ padding: 40, color: 'white', background: '#111', minHeight: 200 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Leads Debug</h1>
      <p>{status}</p>
    </div>
  );
}
