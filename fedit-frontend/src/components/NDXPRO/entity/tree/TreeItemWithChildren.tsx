import { prefixValueForAttributeType } from 'constants/entity';
import { AttributeTypes, GeoJsonTypes } from 'types/common';
import { targetInfoType, TreeJsonType } from 'types/entityTree';
import ItemValueForGeoCollection from './ItemValueForGeoCollection';
import ItemValueForPrimitive from './ItemValueForPrimitive';
import ItemValueForReference from './ItemValueForReference';
import ItemValueForGeoJson from './ItermValueForGeoJson';
import TreeItemTemplate from './TreeItemTemplate';
import TreeList from './TreeList';

interface IProps {
  treeJson: TreeJsonType;
  depth: number;
  targetInfo: targetInfoType;
  treePath: string;
}

function TreeItemWithChildren({
  treeJson,
  depth,
  targetInfo,
  treePath,
}: IProps) {
  const targetData = treeJson[depth].find((el) => {
    return targetInfo.target === el.target && targetInfo.parent === el.parent;
  });
  const currentPath = `${treePath}/${targetInfo.target}`;

  const targetChildren = targetData?.children;
  const childrenEntries = targetChildren
    ? Object.entries(targetChildren)
    : undefined;

  return (
    <TreeItemTemplate
      label={targetData?.target}
      attributeType={targetData?.type}
      childTreeJson={treeJson[depth + 1]}
      treePath={currentPath}
    >
      <ul>
        {childrenEntries?.map(([label, value]: [string, any], index) => {
          const loopKey = `${label}-${index}`;

          if (
            value.constructor === String &&
            value.includes(prefixValueForAttributeType)
          ) {
            return (
              <TreeList
                key={loopKey}
                treeJson={treeJson}
                depth={depth + 1}
                parent={targetData?.target}
                treePath={currentPath}
              />
            );
          }

          if (
            targetData?.type === AttributeTypes.GeoProperty &&
            value.constructor === Object
          ) {
            return value.type === GeoJsonTypes.GeometryCollection ? (
              <ItemValueForGeoCollection
                key={loopKey}
                geometriesInfo={value}
                treePath={currentPath}
              />
            ) : (
              <ItemValueForGeoJson
                key={loopKey}
                locationInfo={value}
                treePath={currentPath}
              />
            );
          }

          // 참조 타입의 value인 경우
          if ([Array, Object].includes(value.constructor)) {
            return (
              <ItemValueForReference
                key={loopKey}
                value={value}
                treePath={currentPath}
              />
            );
          }

          // 원시 타입의 value인 경우
          return (
            <ItemValueForPrimitive key={loopKey} label={label} value={value} />
          );
        })}
      </ul>
    </TreeItemTemplate>
  );
}

export default TreeItemWithChildren;
