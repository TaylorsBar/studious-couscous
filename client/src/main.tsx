/**
 * @file The main entry point for the Karapiro Cartel client application.
 *
 * This file is responsible for:
 * 1. Creating the root React DOM node.
 * 2. Setting up all necessary application-wide providers, including:
 *    - React Router for navigation.
 *    - React Query for data fetching and caching.
 *    - Helmet for managing document head metadata.
 *    - Hot Toast for notifications.
 *    - React DnD for drag-and-drop functionality.
 *    - Custom context providers for Authentication, Theming, Sockets, and Internationalization (i18n).
 * 3. Rendering the main `App` component into the DOM.
 * 4. Wrapping the application in an `ErrorBoundary` for graceful error handling.
 */
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