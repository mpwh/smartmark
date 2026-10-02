import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import { VFSContext } from './vfs/context'
import { sampleFS } from './vfs/memory'
import './styles.css'

const router = createRouter({ routeTree })
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const queryClient = new QueryClient()
const vfs = sampleFS()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <VFSContext.Provider value={vfs}>
        <RouterProvider router={router} />
      </VFSContext.Provider>
    </QueryClientProvider>
  </StrictMode>,
)
