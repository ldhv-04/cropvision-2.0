import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import './globals.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } })}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
