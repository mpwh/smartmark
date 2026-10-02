export interface WriteOptions {
  /** Overwrite even if the file changed since it was read. */
  force?: boolean
}

export interface VFS {
  /** Every file path in the workspace (posix, no leading slash). Dot-folders may be included; the tree filters them. */
  listAll(): Promise<string[]>
  read(path: string): Promise<string>
  /** Rejects with ConflictError if the file changed since it was read (unless force). */
  write(path: string, content: string, opts?: WriteOptions): Promise<void>
  /** Subscribe to external changes (paths that changed). Returns an unsubscribe function. */
  watch?(onChange: (paths: string[]) => void): () => void
}

export class ConflictError extends Error {
  constructor(public path: string) {
    super(`${path} changed on disk`)
  }
}
