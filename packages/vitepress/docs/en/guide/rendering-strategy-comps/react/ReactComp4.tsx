import { type JSX, useState } from 'react';
import type { CompProps } from '../type';

export function ReactComp4(props: CompProps): JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp4-example">
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
          <button
            style={{
              padding: '5px',
              borderRadius: '8px',
              fontSize: '14px',
              marginRight: '8px',
              backgroundColor: '#56a8ab',
              color: '#9ee2d3',
              border: 'none',
            }}
            onClick={() => setCount(count + 1)}
            type="button"
          >
            Click Me!
          </button>
          <strong>
            Pre-rendering Client Visible Hydration Mode, React Instance Count:
          </strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
