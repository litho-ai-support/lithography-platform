// src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';

import { bootstrapGraphQLRuntime } from '@/app/bootstrap';
import { GraphQLProvider, ThemeProvider } from '@/app/providers';
import { App } from '@/app/router';

import { AuthSessionProvider } from '@/features/auth-session';

import './index.css';

bootstrapGraphQLRuntime();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthSessionProvider>
      <GraphQLProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </GraphQLProvider>
    </AuthSessionProvider>
  </React.StrictMode>,
);
