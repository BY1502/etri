export type ValueOf<T> = T[keyof T];

export type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'REGULAR_USER' | 'PENDING';

export interface FlexableObjectType {
  [key: string]: any;
}

export enum AttributeTypes {
  Property = 'Property',
  Relationship = 'Relationship',
  GeoProperty = 'GeoProperty',
  None = 'None',
}

export enum GeoJsonTypes {
  Point = 'Point',
  MultiPoint = 'MultiPoint',
  LineString = 'LineString',
  MultiLineString = 'MultiLineString',
  Polygon = 'Polygon',
  MultiPolygon = 'MultiPolygon',
  GeometryCollection = 'GeometryCollection',
}

export interface getAllAttrWithPageProps {
  curPage: number;
  size?: number;
  word?: string;
}

export interface DataManagerPageResponseDTO<ItemType> {
  data: ItemType[];
  totalData: number;
  totalPage: number;
}

export interface SelectData {
  label: string;
  value: string;
}

export interface IModelAttributeAsideSearch {
  curPage?: number;
  size?: number;
  word?: string | undefined;
  isReady?: boolean | undefined;
}
