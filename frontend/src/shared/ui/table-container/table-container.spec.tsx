// src/shared/ui/table-container/table-container.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TableContainer } from './index';

describe('TableContainer', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title, extra and children inside the table container', () => {
    render(
      <TableContainer extra={<span>共 3 条</span>} title="维修申请">
        <table>
          <tbody>
            <tr>
              <td>行内容</td>
            </tr>
          </tbody>
        </table>
      </TableContainer>,
    );

    const container = screen.getByText('行内容').closest('section');

    expect(container).toHaveClass('table-container');
    expect(screen.getByText('维修申请')).toHaveClass('data-card-title');
    expect(screen.getByText('共 3 条').closest('.data-card-extra')).not.toBeNull();
  });

  it('omits the header area when neither title nor extra is provided', () => {
    render(
      <TableContainer>
        <p>仅表格</p>
      </TableContainer>,
    );

    expect(
      screen.getByText('仅表格').closest('section')?.querySelector('.data-card-header'),
    ).toBeNull();
  });
});
