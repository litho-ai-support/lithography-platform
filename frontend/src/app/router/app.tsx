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
import {
  CustomerPage,
  CustomerRepairRequestDetailRoute,
  CustomerRepairRequestsPage,
} from '@/pages/customer';
import { EngineerPage } from '@/pages/engineer';
import { EngineerRepairRequestDetailPage } from '@/pages/engineer-repair-request-detail';
import { EngineerRepairRequestsPage } from '@/pages/engineer-repair-requests';
import { ErrorPreviewPage } from '@/pages/error-preview';
import { ProjectStructurePage } from '@/pages/project-structure';
import { ReferenceDocumentDetailPage } from '@/pages/reference-document-detail';
import { ReferenceDocumentNewPage } from '@/pages/reference-document-new';
import { ReferenceDocumentsPage } from '@/pages/reference-documents';
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
        element: <EngineerRepairRequestsPage />,
        loader: protectedRouteLoader,
        path: 'engineer/repair-requests',
      },
      {
        element: <EngineerRepairRequestDetailPage />,
        loader: protectedRouteLoader,
        path: 'engineer/repair-requests/:requestId',
      },
      {
        element: <CustomerPage />,
        loader: protectedRouteLoader,
        path: 'customer',
      },
      {
        // T-04（前移注册）：列表与详情；角色治理复用 protectedRouteLoader，
        // SUPER_ADMIN 按裁定 2 继承放行（不扩大拒绝清单，拒绝清单仍仅拒 /new）。
        element: <CustomerRepairRequestsPage />,
        loader: protectedRouteLoader,
        path: 'customer/repair-requests',
      },
      {
        element: <CustomerRepairRequestDetailRoute />,
        loader: protectedRouteLoader,
        path: 'customer/repair-requests/:requestId',
      },
      {
        element: <RepairRequestCreatePage />,
        loader: protectedRouteLoader,
        path: 'customer/repair-requests/new',
      },
      {
        // AI 参考资料库（0907 任务二）：角色治理复用 protectedRouteLoader +
        // auth-session 角色路径表（ENGINEER/SUPER_ADMIN 放行，CUSTOMER 安全跳转）；
        // 新增页对 ENGINEER 由角色路径拒绝清单拦截（与后端写接口精确口径一致）
        element: <ReferenceDocumentsPage />,
        loader: protectedRouteLoader,
        path: 'reference-documents',
      },
      {
        element: <ReferenceDocumentNewPage />,
        loader: protectedRouteLoader,
        path: 'reference-documents/new',
      },
      {
        element: <ReferenceDocumentDetailPage />,
        loader: protectedRouteLoader,
        path: 'reference-documents/:documentId',
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
