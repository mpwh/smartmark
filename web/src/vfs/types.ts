export interface VFS {
  /** Every file path in the workspace (posix, no leading slash). Dot-folders may be included; the tree filters them. */
  listAll(): Promise<string[]>
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
}
