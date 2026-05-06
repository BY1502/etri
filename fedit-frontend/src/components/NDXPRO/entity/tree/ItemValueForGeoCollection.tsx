import { AttributeTypes } from 'types/common';
import ItemValueForGeoJson from './ItermValueForGeoJson';
import TreeItemTemplate from './TreeItemTemplate';

interface LocationInfo {
  type: string;
  coordinates: any;
}

interface IProps {
  geometriesInfo: {
    type: string;
    geometries: LocationInfo[];
  };
  treePath: string;
}

function ItemValueForGeoCollection({ geometriesInfo, treePath }: IProps) {
  const currentPath = `${treePath}/geometries`;

  return (
    <TreeItemTemplate
      className="depth-division"
      label="geometries"
      attributeType={AttributeTypes.None}
      treePath={currentPath}
    >
      <ul>
        {geometriesInfo.geometries.map((locationInfo, idx) => {
          const loopKey = `${locationInfo.coordinates}-${idx}`;
          return (
            <ItemValueForGeoJson
              key={loopKey}
              locationInfo={locationInfo}
              treePath={currentPath}
            />
          );
        })}
      </ul>
    </TreeItemTemplate>
  );
}

export default ItemValueForGeoCollection;
