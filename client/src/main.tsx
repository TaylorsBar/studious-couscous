import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { ReactQueryDevtools } from 'react-query/devtools'
import { HelmetProvider } from 'react-helmet-async'
import { Toaster } from 'react-hot-toast'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'

import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { SocketProvider } from './contexts/SocketContext'
import { I18nProvider } from './contexts/I18nContext'
import ErrorBoundary from './components/common/ErrorBoundary'

import './index.css'

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <BrowserRouter>
          <QueryClientProvider client={queryClient}>
            <I18nProvider>
              <ThemeProvider>
                <AuthProvider>
                  <SocketProvider>
                    <DndProvider backend={HTML5Backend}>
                      <App />
                      <Toaster
                        position="top-right"
                        toastOptions={{
                          duration: 4000,
                          style: {
                            background: '#363636',
                            color: '#fff',
                          },
                          success: {
                            duration: 3000,
                            iconTheme: {
                              primary: '#22c55e',
                              secondary: '#fff',
                            },
                          },
                          error: {
                            duration: 5000,
                            iconTheme: {
                              primary: '#ef4444',
                              secondary: '#fff',
                            },
                          },
                        }}
                      />
                    </DndProvider>
                  </SocketProvider>
                </AuthProvider>
              </ThemeProvider>
            </I18nProvider>
            <ReactQueryDevtools initialIsOpen={false} />
          </QueryClientProvider>
        </BrowserRouter>
      </HelmetProvider>
    </ErrorBoundary>
  </React.StrictMode>
)