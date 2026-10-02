import { useEffect, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { Table, TaskList } from '@lezer/markdown'
import { frontmatterParser, markdownExtras } from './mdExtras'
import {
  livePreviewPlugin,
  markdownStylePlugin,
  editorTheme,
  mouseSelectingField,
  collapseOnSelectionFacet,
  setMouseSelecting,
  tableField,
  imageField,
  linkPlugin,
} from 'codemirror-live-markdown'

export type EditorMode = 'live' | 'source'

interface Props {
  /** Changing docKey (file path) recreates the editor with `value` as initial text. */
  docKey: string
  value: string
  mode: EditorMode
  onChange: (text: string) => void
  onSave: () => void
}

const liveExtensions: Extension[] = [
  collapseOnSelectionFacet.of(true),
  mouseSelectingField,
  livePreviewPlugin,
  markdownStylePlugin,
  editorTheme,
  tableField,
  imageField(),
  linkPlugin(),
  markdownExtras,
]

export function Editor({ docKey, value, mode, onChange, onSave }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const cb = useRef({ onChange, onSave })
  cb.current = { onChange, onSave }
  // Latest text, so a mode switch keeps unsaved edits.
  const text = useRef(value)
  const lastKey = useRef(docKey)
  if (lastKey.current !== docKey) {
    lastKey.current = docKey
    text.current = value
  }

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text.current,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ extensions: [Table, TaskList, frontmatterParser] }),
          ...(mode === 'live' ? liveExtensions : []),
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: () => (cb.current.onSave(), true) },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              text.current = u.state.doc.toString()
              cb.current.onChange(text.current)
            }
          }),
        ],
      }),
    })
    const down = () => view.dispatch({ effects: setMouseSelecting.of(true) })
    const up = () => requestAnimationFrame(() => view.dispatch({ effects: setMouseSelecting.of(false) }))
    if (mode === 'live') {
      view.contentDOM.addEventListener('mousedown', down)
      document.addEventListener('mouseup', up)
    }
    return () => {
      document.removeEventListener('mouseup', up)
      view.destroy()
    }
  }, [docKey, mode])

  return <div className="editor" ref={host} />
}
