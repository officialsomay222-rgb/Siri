'use client';

import dynamic from 'next/dynamic';

const AvatarCompanionStudio = dynamic(
  () => import('@/components/AvatarCompanionStudio'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0B0F17] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-sky-500/20" />
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          </div>
          <p className="text-xs font-medium tracking-widest text-slate-400 uppercase">
            Loading Silas & Airi 3D
          </p>
        </div>
      </div>
    ),
  }
);

export default function HomePage() {
  return <AvatarCompanionStudio />;
}
