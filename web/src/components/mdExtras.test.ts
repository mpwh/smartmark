import { describe, expect, it } from 'vitest'
import { parser, Table, TaskList } from '@lezer/markdown'
import { frontmatterParser } from './mdExtras'

const p = parser.configure([Table, TaskList, frontmatterParser])
const names = (src: string) => {
  const out: string[] = []
  p.parse(src).iterate({ enter: (n) => void out.push(`${n.name}@${n.from}-${n.to}`) })
  return out
}

describe('frontmatter parser', () => {
  const src = '---\ntitle: Ideas\n---\n\n## Ideas\n\n1. a\n2. b\n'
  it('treats leading yaml as one Frontmatter block', () => {
    const n = names(src)
    console.log(n.join('\n'))
    expect(n).toContain('Frontmatter@0-20')
    expect(n.some((x) => x.startsWith('SetextHeading'))).toBe(false)
    expect(n.some((x) => x.startsWith('HorizontalRule'))).toBe(false)
  })
  it('leaves a plain leading rule alone', () => {
    expect(names('---\n\n# Hi\n').some((x) => x.startsWith('Frontmatter'))).toBe(false)
  })
})

describe('list tree', () => {
  it('ordered list mark parents', () => {
    const t = p.parse('1. a\n2. b\n')
    const seen: string[] = []
    t.iterate({ enter: (n) => { if (n.name === 'ListMark') seen.push(`${n.node.parent?.name}>${n.node.parent?.parent?.name}`) } })
    expect(seen).toEqual(['ListItem>OrderedList', 'ListItem>OrderedList'])
  })
})
