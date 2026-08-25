// src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';

import { bootstrapGraphQLRuntime } from '@/app/bootstrap';
import { GraphQLProvider, ThemeProvider } from '@/app/providers';
import { App } from '@/app/router';

import './index.css';

bootstrapGraphQLRuntime();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GraphQLProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </GraphQLProvider>
  </React.StrictMode>,
);
