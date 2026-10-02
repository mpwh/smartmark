import { useMemo } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify)

const stripFrontmatter = (s: string) => s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')

export function ReadView({ text }: { text: string }) {
  // remark-rehype drops raw HTML by default (no allowDangerousHtml), so output is safe to inject.
  const html = useMemo(() => String(processor.processSync(stripFrontmatter(text))), [text])
  return <article className="read" dangerouslySetInnerHTML={{ __html: html }} />
}
