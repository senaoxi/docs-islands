import { type JSX, useState } from 'react';
import type { CompProps } from '../type';
import './css/rc1.css';
import { renderSharedLicense } from './shared/renderSharedLicense';

export default function ReactComp1(props: CompProps): JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp1-example">
      <strong>
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong>{' '}
          <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <strong>License:</strong> <span>{renderSharedLicense()}</span>
        </li>
        <li>
          <button
            className="rc1-button"
            onClick={() => setCount(count + 1)}
            type="button"
          >
            Click Me!
          </button>
          <strong>Client-Only Rendering Mode, React Instance Count:</strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
