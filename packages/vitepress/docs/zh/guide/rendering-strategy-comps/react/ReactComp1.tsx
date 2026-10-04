import { type JSX, useState } from 'react';
import type { CompProps } from '../type';
import './css/rc1.css';
import { renderSharedLicense } from './shared/renderSharedLicense';

export default function ReactComp1(props: CompProps): JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp1-example">
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
          <strong>协议:</strong> <span>{renderSharedLicense()}</span>
        </li>
        <li>
          <button
            className="rc1-button"
            onClick={() => setCount(count + 1)}
            type="button"
          >
            点击我!
          </button>
          <strong>仅客户端渲染模式, React 实例数量:</strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
