'use client';

import { useState, useEffect, Suspense, lazy } from 'react';

const ClientApp = lazy(() => import('@/components/ClientApp'));

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <ClientApp />
    </Suspense>
  );
}
