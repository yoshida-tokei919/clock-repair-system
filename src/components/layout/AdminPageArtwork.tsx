'use client'

import { usePathname } from 'next/navigation'

const ARTWORK_PAGES = new Set(['/admin', '/repairs', '/inquiries'])

export function AdminPageArtwork({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (!ARTWORK_PAGES.has(pathname)) return <>{children}</>

  return (
    <div className="relative isolate">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 right-0 z-0 hidden aspect-[1672/941] w-[min(65vw,900px)] bg-contain bg-right-bottom bg-no-repeat opacity-[0.05] md:block"
        style={{ backgroundImage: 'url("/images/app-background-watch.png")' }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
