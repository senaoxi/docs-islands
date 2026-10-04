import { type JSX, useState } from 'react';
import type { CompProps } from '../type';

export function ReactComp4(props: CompProps): JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp4-example">
      <strong>
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
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
            点击我!
          </button>
          <strong>预渲染客户端可见 hydration 模式, React 实例数量:</strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
