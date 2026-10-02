import type { MarkdownConfig } from '@lezer/markdown'
import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'

const FM_OPEN = /^---[ \t]*$/
// A real frontmatter block starts with a YAML-looking line; otherwise a leading `---` is just a rule.
const FM_FIRST = /^([\w"'][^:]*:|#|\s*-\s|---|\.\.\.)/
const FM_CLOSE = /^(---|\.\.\.)[ \t]*$/

/** Number of lines (incl. fences) taken by a leading YAML frontmatter block, or 0. */
function frontmatterLines(lines: string[]): number {
  if (!lines.length || !FM_OPEN.test(lines[0]) || !FM_FIRST.test(lines[1] ?? '')) return 0
  for (let i = 1; i < lines.length; i++) if (FM_CLOSE.test(lines[i])) return i + 1
  return 0
}

/** Lezer extension: parse leading `---` frontmatter as one block so it isn't read as a setext heading / hr. */
export const frontmatterParser: MarkdownConfig = {
  defineNodes: [{ name: 'Frontmatter', block: true }],
  parseBlock: [
    {
      name: 'Frontmatter',
      before: 'HorizontalRule',
      parse(cx, line) {
        if (cx.lineStart !== 0 || !FM_OPEN.test(line.text)) return false
        if (!FM_FIRST.test(cx.peekLine())) return false
        const from = cx.lineStart
        let closed = false
        while (cx.nextLine()) {
          if (FM_CLOSE.test(line.text.replace(/\r$/, ''))) {
            closed = true
            break
          }
        }
        const to = cx.lineStart + line.text.length
        if (closed) cx.nextLine()
        cx.addElement(cx.elt('Frontmatter', from, to))
        return true
      },
    },
  ],
}

class MarkWidget extends WidgetType {
  constructor(readonly text: string, readonly cls: string) {
    super()
  }
  eq(o: MarkWidget) {
    return o.text === this.text && o.cls === this.cls
  }
  toDOM() {
    const s = document.createElement('span')
    s.className = this.cls
    s.textContent = this.text
    return s
  }
}

class CheckWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(o: CheckWidget) {
    return o.checked === this.checked
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-task-check'
    box.checked = this.checked
    box.addEventListener('mousedown', (e) => e.preventDefault())
    box.addEventListener('click', (e) => {
      e.preventDefault()
      const pos = view.posAtDOM(box)
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: this.checked ? ' ' : 'x' } })
    })
    return box
  }
  ignoreEvent() {
    return true
  }
}

function build(view: EditorView): DecorationSet {
  const { state } = view
  const active = new Set(state.selection.ranges.flatMap((r) => [state.doc.lineAt(r.from).number, state.doc.lineAt(r.to).number]))
  const b = new RangeSetBuilder<Decoration>()

  // Frontmatter lines
  const head: string[] = []
  for (let i = 1; i <= Math.min(state.doc.lines, 200); i++) head.push(state.doc.line(i).text)
  const fm = frontmatterLines(head)
  const fmLines = new Set<number>()
  for (let i = 1; i <= fm; i++) fmLines.add(i)

  // Widgets for list markers / task boxes, collected then sorted
  const items: { from: number; to: number; deco: Decoration }[] = []
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const line = state.doc.lineAt(node.from).number
        if (fmLines.has(line)) return
        if (active.has(line)) return
        if (node.name === 'TaskMarker') {
          const checked = /x/i.test(state.sliceDoc(node.from, node.to))
          items.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: new CheckWidget(checked) }) })
        } else if (node.name === 'ListMark') {
          const text = state.sliceDoc(node.from, node.to)
          const isTask = node.node.parent?.getChild('Task') != null
          const parentList = node.node.parent?.parent?.name
          const w = isTask
            ? new MarkWidget('', 'cm-list-mark')
            : parentList === 'OrderedList'
              ? new MarkWidget(text, 'cm-list-mark cm-list-num')
              : new MarkWidget('•', 'cm-list-mark cm-list-bullet')
          items.push({ from: node.from, to: node.to, deco: Decoration.replace({ widget: w }) })
        }
      },
    })
  }
  const lineDecos = [...fmLines].filter((n) => n <= state.doc.lines).map((n) => ({
    from: state.doc.line(n).from,
    to: state.doc.line(n).from,
    deco: Decoration.line({ class: n === 1 || n === fm ? 'cm-frontmatter cm-frontmatter-fence' : 'cm-frontmatter' }),
  }))
  for (const it of [...lineDecos, ...items].sort((a, c) => a.from - c.from || a.to - c.to)) b.add(it.from, it.to, it.deco)
  return b.finish()
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState))
        this.decorations = build(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)

const theme = EditorView.baseTheme({
  '.cm-list-mark': { opacity: 0.75 },
  '.cm-list-bullet': { display: 'inline-block', width: '1em', textAlign: 'center' },
  '.cm-list-num': { fontVariantNumeric: 'tabular-nums' },
  '.cm-task-check': { margin: '0 4px 0 0', verticalAlign: 'middle', cursor: 'pointer' },
  '.cm-frontmatter': { fontFamily: 'ui-monospace, monospace', fontSize: '0.85em', color: 'var(--muted)', background: 'var(--side)' },
  '.cm-frontmatter-fence': { opacity: 0.6 },
})

export const markdownExtras: Extension = [plugin, theme]
