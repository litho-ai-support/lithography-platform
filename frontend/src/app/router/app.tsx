// src/app/router/app.tsx

import {
  createBrowserRouter,
  isRouteErrorResponse,
  redirect,
  RouterProvider,
  useRouteError,
} from 'react-router';

import { AppLayout } from '@/app/layout';

import { AdminPage } from '@/pages/admin';
import { CustomerPage } from '@/pages/customer';
import { EngineerPage } from '@/pages/engineer';
import { ErrorPreviewPage } from '@/pages/error-preview';
import { ProjectStructurePage } from '@/pages/project-structure';
import { RepairRequestCreatePage } from '@/pages/repair-request-create';
import { Error403, Error404, Error500, ErrorRouteCrash } from '@/features/error-feedback';

import { getAppEnv } from '@/shared/env';

import { canAccessGame2048Lab, Game2048LabPage } from '@/labs/game-2048';
import { canAccessSandboxPlayground, SandboxPlaygroundPage } from '@/sandbox/playground';

import { LoginPageRoute } from './login-page-route';
import { indexRouteLoader, loginLoader, protectedRouteLoader } from './route-guards';
import { registerAppRouter } from './router-bridge';

function RouteErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 403) {
      return <Error403 />;
    }

    if (error.status === 404) {
      return <Error404 />;
    }

    if (error.status >= 500) {
      return <Error500 />;
    }
  }

  return <ErrorRouteCrash />;
}

function RouteErrorBoundary() {
  return (
    <AppLayout>
      <RouteErrorPage />
    </AppLayout>
  );
}

function game2048LabLoader() {
  if (!canAccessGame2048Lab(getAppEnv())) {
    throw redirect('/');
  }

  return null;
}

function sandboxPlaygroundLoader() {
  if (!canAccessSandboxPlayground(getAppEnv())) {
    throw redirect('/');
  }

  return null;
}

const router = createBrowserRouter([
  {
    children: [
      {
        index: true,
        loader: indexRouteLoader,
      },
      {
        element: <LoginPageRoute />,
        loader: loginLoader,
        path: 'login',
      },
      {
        element: <AdminPage />,
        loader: protectedRouteLoader,
        path: 'admin',
      },
      {
        element: <EngineerPage />,
        loader: protectedRouteLoader,
        path: 'engineer',
      },
      {
        element: <CustomerPage />,
        loader: protectedRouteLoader,
        path: 'customer',
      },
      {
        element: <RepairRequestCreatePage />,
        loader: protectedRouteLoader,
        path: 'customer/repair-requests/new',
      },
      {
        element: <ProjectStructurePage />,
        path: 'project-structure',
      },
      {
        element: <ErrorPreviewPage />,
        path: 'error-preview',
      },
      {
        element: <Game2048LabPage />,
        loader: game2048LabLoader,
        path: 'labs/game-2048',
      },
      {
        element: <SandboxPlaygroundPage />,
        loader: sandboxPlaygroundLoader,
        path: 'sandbox/playground',
      },
      {
        element: <Error404 />,
        path: '*',
      },
    ],
    element: <AppLayout />,
    errorElement: <RouteErrorBoundary />,
    path: '/',
  },
]);

registerAppRouter(router);

export function App() {
  return <RouterProvider router={router} />;
}
