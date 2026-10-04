import { useState } from 'react';
import type { CompProps } from '../type';
import './css/rc3.css';

export default function ReactComp3(props: CompProps): JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp3-example">
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
            className="rc3-button"
            onClick={() => setCount(count + 1)}
            type="button"
          >
            点击我!
          </button>
          <strong>预渲染客户端 hydration 模式, React 实例数量:</strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
