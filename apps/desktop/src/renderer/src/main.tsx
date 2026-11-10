import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@cropvision/theme-tokens/react';
import { App } from './App';
import './globals.css';

// Best-effort persistence of the chosen palette; theming works without it (private mode, blocked storage).
const storage = { get: (k: string) => localStorage.getItem(k), set: (k: string, v: string) => localStorage.setItem(k, v) };

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider initial="agri-command-dark" storage={storage} applyTo={document.documentElement}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } })}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
