import { type JSX, useState } from 'react';
import type { CompProps } from '../type';
import './css/rc3.css';

export default function ReactComp3(props: CompProps): JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp3-example">
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
            className="rc3-button"
            onClick={() => setCount(count + 1)}
            type="button"
          >
            Click Me!
          </button>
          <strong>
            Pre-rendering Client Hydration Mode, React Instance Count:
          </strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
