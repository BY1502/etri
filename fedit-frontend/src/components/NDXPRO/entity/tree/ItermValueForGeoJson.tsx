import ItemSVG from 'assets/images/entity.svg';

import { AttributeTypes, GeoJsonTypes } from 'types/common';
import TreeItemTemplate from './TreeItemTemplate';

interface CoordinateType<T> {
  idx: number;
  coordinates: T;
}

interface DepthCoordinateType<T> extends CoordinateType<T> {
  treePath: string;
}

function ItemValueForArray({ idx, coordinates }: CoordinateType<number[]>) {
  return (
    <li className="depth-division item-tab-label">
      <img src={ItemSVG} alt="아이템 아이콘" />
      <span>{idx}: </span>
      <strong>{coordinates.join(', ')}</strong>
    </li>
  );
}

function ItemValueForDoubleArray({
  idx,
  coordinates,
  treePath,
}: DepthCoordinateType<number[][]>) {
  const currentPath = `${treePath}/${idx}`;

  return (
    <TreeItemTemplate
      className="depth-division"
      label={idx.toString()}
      attributeType={AttributeTypes.None}
      treePath={currentPath}
    >
      <ul>
        {coordinates.map((point, idx) => {
          const loopKey = `${point.toString}-${idx}`;
          return (
            <ItemValueForArray key={loopKey} idx={idx} coordinates={point} />
          );
        })}
      </ul>
    </TreeItemTemplate>
  );
}

function ItemValueForTripleArray({
  idx,
  coordinates,
  treePath,
}: DepthCoordinateType<number[][][]>) {
  const currentPath = `${treePath}/${idx}`;

  return (
    <TreeItemTemplate
      className="depth-division"
      label={idx.toString()}
      attributeType={AttributeTypes.None}
      treePath={currentPath}
    >
      <ul>
        {coordinates.map((lineString, idx) => {
          const loopKey = `${lineString.toString}-${idx}`;
          return (
            <ItemValueForDoubleArray
              key={loopKey}
              idx={idx}
              coordinates={lineString}
              treePath={currentPath}
            />
          );
        })}
      </ul>
    </TreeItemTemplate>
  );
}

interface IProps {
  locationInfo: {
    type: string;
    coordinates: any;
  };
  treePath: string;
}

function ItemValueForGeoJson({ locationInfo, treePath }: IProps) {
  let renderComponent;
  const currentPath = `${treePath}/coordinate`;

  switch (locationInfo.type) {
    case GeoJsonTypes.Point:
      renderComponent = (
        <ul>
          <ItemValueForArray idx={0} coordinates={locationInfo.coordinates} />
        </ul>
      );
      break;
    case GeoJsonTypes.MultiPoint:
    case GeoJsonTypes.LineString:
      renderComponent = (
        <ul>
          {locationInfo.coordinates.map((point: number[], idx: number) => {
            const loopKey = Math.random();
            return (
              <ItemValueForArray key={loopKey} idx={idx} coordinates={point} />
            );
          })}
        </ul>
      );
      break;
    case GeoJsonTypes.MultiLineString:
    case GeoJsonTypes.Polygon:
      renderComponent = (
        <ul>
          {locationInfo.coordinates.map(
            (lineString: number[][], idx: number) => {
              const loopKey = `${lineString}-${idx}`;
              return (
                <ItemValueForDoubleArray
                  key={loopKey}
                  idx={idx}
                  coordinates={lineString}
                  treePath={currentPath}
                />
              );
            },
          )}
        </ul>
      );
      break;
    case GeoJsonTypes.MultiPolygon:
      renderComponent = (
        <ul>
          {locationInfo.coordinates.map(
            (polygon: number[][][], idx: number) => {
              const loopKey = `${polygon}-${idx}`;
              return (
                <ItemValueForTripleArray
                  key={loopKey}
                  idx={idx}
                  coordinates={polygon}
                  treePath={currentPath}
                />
              );
            },
          )}
        </ul>
      );
      break;
    default:
      renderComponent = (
        <div style={{ color: 'red' }}>
          wrong component check a Geo json type
        </div>
      );
      break;
  }
  return (
    <TreeItemTemplate
      className="depth-division"
      label="coordinate"
      attributeType={locationInfo.type}
      treePath={currentPath}
    >
      {renderComponent}
    </TreeItemTemplate>
  );
}

export default ItemValueForGeoJson;
