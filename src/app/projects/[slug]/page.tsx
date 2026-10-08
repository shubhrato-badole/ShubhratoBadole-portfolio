import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { projects } from '@/components/work/data'
import ProjectDetail from '@/components/work/ProjectDetail'

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export const generateStaticParams = () =>
  projects.map((p) => ({ slug: p.slug }))

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params

  const p = projects.find((x) => x.slug === slug)

  return p
    ? {
        title: `${p.title} — Shubhrato Badole`,
        description: p.description[0],
      }
    : {}
}

export default async function Page({ params }: Props) {
  const { slug } = await params

  if (!projects.some((p) => p.slug === slug)) {
    notFound()
  }

  return <ProjectDetail slug={slug} />
}