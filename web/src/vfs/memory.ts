import type { VFS } from './types'

export function createMemoryFS(seed: Record<string, string>): VFS {
  const files = new Map(Object.entries(seed))
  return {
    async listAll() {
      return [...files.keys()].sort()
    },
    async read(path) {
      const v = files.get(path)
      if (v === undefined) throw new Error(`ENOENT: ${path}`)
      return v
    },
    async write(path, content) {
      files.set(path, content)
    },
  }
}

export const sampleFS = () =>
  createMemoryFS({
    'README.md': '# Smartmark\n\nWelcome. **Bold**, *italic*, `code`, and a [link](https://example.com).\n\n- [ ] todo\n- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
    'notes/ideas.md': '---\ntitle: Ideas\n---\n\n## Ideas\n\n1. Ship the tree\n2. Ship the editor\n',
    'notes/deep/log.markdown': '# Log\n\nSome text.\n',
    'notes/photo.png': '',
    'src/main.ts': 'console.log(1)',
    'docs/spec.md': '# Spec\n',
    '.git/config': '',
    '.smartmark/config.json': '{}',
    'data/only-other.csv': 'a,b',
  })
