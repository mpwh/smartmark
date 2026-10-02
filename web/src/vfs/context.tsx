import { createContext, useContext } from 'react'
import type { VFS } from './types'

export const VFSContext = createContext<VFS | null>(null)
export const useVFS = () => {
  const v = useContext(VFSContext)
  if (!v) throw new Error('VFS not provided')
  return v
}
