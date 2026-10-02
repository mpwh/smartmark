import { describe, expect, it } from 'vitest'
import { buildTree } from './tree'

const paths = ['a.md', 'b.png', 'x/y.markdown', 'x/z.txt', 'only/other.csv', '.git/config', 'x/.hidden/n.md']
const names = (n: ReturnType<typeof buildTree>): string[] =>
  n.flatMap((c) => [c.path, ...names(c.children)])

describe('buildTree', () => {
  it('shows only markdown and folders that contain it', () => {
    expect(names(buildTree(paths))).toEqual(['x', 'x/y.markdown', 'a.md'])
  })
  it('greys out other files when showOthers', () => {
    const t = buildTree(paths, true)
    expect(names(t)).toContain('b.png')
    expect(t.find((n) => n.path === 'b.png')!.openable).toBe(false)
    expect(t.find((n) => n.path === 'a.md')!.openable).toBe(true)
    expect(names(t)).not.toContain('.git')
  })
})
