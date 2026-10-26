'use client'
import { useMemo, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { cardsMounted, closeProject, openProject, registerHero } from './transition'

/**
 * Kept for compatibility. Mounting <WorkGlProvider> in layout.tsx is now OPTIONAL (it just renders its children):
 * the transition lives in ./transition.ts and the cursor smoke is rendered by <Work /> and <ProjectDetail />.
 */
export const useWork = () => {
  const router = useRouter()
  return useMemo(() => ({
    open: (slug: string, mediaEl: HTMLElement) => { void openProject(router, slug, mediaEl) },
    close: (slug: string) => { void closeProject(router, slug) },
    registerHero, cardsMounted,
  }), [router])
}

export default function WorkGlProvider({ children }: { children?: ReactNode; smoke?: boolean }) { return <>{children}</> }
