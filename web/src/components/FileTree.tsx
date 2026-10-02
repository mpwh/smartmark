import { useState } from 'react'
import type { TreeNode } from '../vfs/tree'

interface Props {
  nodes: TreeNode[]
  selected?: string
  onOpen: (path: string) => void
}

export function FileTree({ nodes, selected, onOpen }: Props) {
  return (
    <ul className="tree" role="tree">
      {nodes.map((n) => (
        <Node key={n.path} node={n} selected={selected} onOpen={onOpen} depth={0} />
      ))}
    </ul>
  )
}

function Node({ node, selected, onOpen, depth }: { node: TreeNode; depth: number } & Omit<Props, 'nodes'>) {
  const [open, setOpen] = useState(depth === 0)
  const pad = { paddingLeft: 8 + depth * 14 }
  if (node.kind === 'dir') {
    return (
      <li role="treeitem" aria-expanded={open}>
        <button className="row dir" style={pad} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} {node.name}
        </button>
        {open && (
          <ul role="group">
            {node.children.map((c) => (
              <Node key={c.path} node={c} selected={selected} onOpen={onOpen} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    )
  }
  return (
    <li role="treeitem" aria-selected={selected === node.path} aria-disabled={!node.openable}>
      <button
        className={`row file${selected === node.path ? ' sel' : ''}${node.openable ? '' : ' dim'}`}
        style={pad}
        disabled={!node.openable}
        onClick={() => onOpen(node.path)}
      >
        {node.name}
      </button>
    </li>
  )
}
