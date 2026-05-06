import { Dispatch, SetStateAction } from 'react';

import { useTreeToggle } from 'components/NDXPRO/hooks/useTreeToggle';
import { AttributeTypes } from 'types/common';
import { TreeJsonType } from 'types/entityTree';

import ToggleButton from './ToggleButton';
import TreeItemWithChildren from './TreeItemWithChildren';
import TreeItemWithLeaf from './TreeItemWithLeaf';

interface IProps {
  treeJson: TreeJsonType;
  depth: number;
  parent: string | undefined;
  treePath: string;
}

function TreeList({ treeJson, depth, parent, treePath }: IProps) {
  const [toggle, setToggle, historyObserverTrigger] = useTreeToggle(
    true,
    treePath,
  ) as [boolean, Dispatch<SetStateAction<boolean>>, FunctionConstructor];
  if (depth === 0) {
    historyObserverTrigger();
  }

  const currentDepthDatas = treeJson[depth].filter(
    (el) => el.parent === parent,
  );

  return (
    <li>
      {depth === 0 && (
        <div className="toggle-tab-label">
          <ToggleButton toggle={toggle} setToggle={setToggle} />
          <button type="button">Attributes</button>
        </div>
      )}
      <div style={{ display: toggle ? 'block' : 'none' }}>
        <ul className="depth-division">
          {currentDepthDatas.map((treeItem) => {
            const loopKey = Math.random();
            const targetInfo = {
              target: treeItem.target,
              parent: treeItem.parent,
            };

            switch (treeItem.type) {
              case AttributeTypes.Relationship:
                return (
                  <TreeItemWithLeaf
                    key={loopKey}
                    treeJson={treeJson}
                    depth={depth}
                    targetInfo={targetInfo}
                    treePath={treePath}
                  />
                );
              case AttributeTypes.Property:
              case AttributeTypes.GeoProperty:
                return (
                  <TreeItemWithChildren
                    key={loopKey}
                    treeJson={treeJson}
                    depth={depth}
                    targetInfo={targetInfo}
                    treePath={treePath}
                  />
                );
              default:
                return (
                  <li key={loopKey} style={{ color: 'red' }}>
                    error component check attributeType
                  </li>
                );
            }
          })}
        </ul>
      </div>
    </li>
  );
}

export default TreeList;
