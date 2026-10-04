import { readFileSync } from 'node:fs';
import { join } from 'pathe';
import { type JSX, useState } from 'react';
import type { CompProps } from '../type';
import './css/rc2.css';
import { renderSharedLicense } from './shared/renderSharedLicense';

interface LocalData {
  data: {
    id: number;
    name: string;
    email: string;
  }[];
}

const targetPath = join(import.meta.dirname, 'local-data.json');

export function ReactComp2(props: CompProps): JSX.Element {
  const [count, setCount] = useState(0);
  const data = JSON.parse(readFileSync(targetPath, 'utf8')) as LocalData;

  const displayLocalData = () => {
    const showLocalList = data.data.map((item) => (
      <li key={item.id}>
        <span>
          <strong>标识位:</strong> {item.id}
        </span>
        <br />
        <span>
          <strong>名称:</strong> {item.name}
        </span>
        <br />
        <span>
          <strong>邮箱:</strong> {item.email}
        </span>
      </li>
    ));
    return <ul>{showLocalList}</ul>;
  };
  return (
    <div className="react-comp2-example">
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
            className="rc2-button"
            onClick={() => setCount(count + 1)}
            type="button"
          >
            点击我!
          </button>
          <strong>仅预渲染模式, React 实例数量:</strong> <span>{count}</span>
        </li>
      </ol>
      <div>{displayLocalData()}</div>
      <div>
        <span>
          <strong>协议:</strong> {renderSharedLicense()}
        </span>
      </div>
    </div>
  );
}
