export interface AttrListItemType {
  id: string;
  type: string;
}

export enum AttributeTypeEnum {
  String = 'String',
  Enum = 'Enum',
  Integer = 'Integer',
  Double = 'Double',
  Boolean = 'Boolean',
  Object = 'Object',
  ArrayString = 'ArrayString',
  ArrayInteger = 'ArrayInteger',
  ArrayDouble = 'ArrayDouble',
  ArrayBoolean = 'ArrayBoolean',
  DateTime = 'DateTime',
  // geo property
  Point = 'POINT',
  MultiPoint = 'MULTI_POINT',
  LineString = 'LINE_STRING',
  MultiLineString = 'MULTI_LINE_STRING',
  Polygon = 'POLYGON',
  MultiPolygon = 'MULTI_POLYGON',
}
