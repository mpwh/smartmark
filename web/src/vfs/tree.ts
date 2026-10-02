export interface TreeNode {
  name: string
  path: string
  kind: 'dir' | 'file'
  /** false for non-markdown files shown greyed out */
  openable: boolean
  children: TreeNode[]
}

export const isMarkdown = (p: string) => /\.(md|markdown)$/i.test(p)

/**
 * Build a tree from flat file paths. Dot-folders are always hidden. Non-markdown
 * files are hidden unless showOthers (then they are returned non-openable).
 * Directories with no visible descendants are dropped.
 */
export function buildTree(paths: string[], showOthers = false): TreeNode[] {
  const root: TreeNode = { name: '', path: '', kind: 'dir', openable: false, children: [] }
  for (const p of paths) {
    const parts = p.split('/')
    if (parts.some((s) => s.startsWith('.'))) continue
    const md = isMarkdown(p)
    if (!md && !showOthers) continue
    let cur = root
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/')
      const isFile = i === parts.length - 1
      let node = cur.children.find((c) => c.name === name && c.kind === (isFile ? 'file' : 'dir'))
      if (!node) {
        node = { name, path, kind: isFile ? 'file' : 'dir', openable: isFile && md, children: [] }
        cur.children.push(node)
      }
      cur = node
    })
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
    n.children.forEach(sort)
  }
  sort(root)
  return root.children
}
