import ItemSVG from 'assets/images/entity.svg';

import { targetInfoType, TreeJsonType } from 'types/entityTree';
import { ItemValueForArray } from './ItemValueForReference';
import TreeItemTemplate from './TreeItemTemplate';

interface IProps {
  treeJson: TreeJsonType;
  depth: number;
  targetInfo: targetInfoType;
  treePath: string;
}

function TreeItemWithLeaf({ treeJson, depth, targetInfo, treePath }: IProps) {
  const currentPath = `${treePath}/${targetInfo.target}`;

  const targetData = treeJson[depth].find((el) => {
    return targetInfo.target === el.target && targetInfo.parent === el.parent;
  });

  return (
    <TreeItemTemplate
      label={targetData?.target}
      attributeType={targetData?.type}
      treePath={currentPath}
    >
      <div className="depth-division">
        <div className="item-tab-label">
          <img src={ItemSVG} alt="아이템 아이콘" />
          <span>object:</span>
        </div>
        <ItemValueForArray array={targetData?.children.object} />
      </div>
    </TreeItemTemplate>
  );
}

export default TreeItemWithLeaf;
