export const modelInitData = {
  id: 'urn:e8ight:',
  type: '',
  description: '',
  title: '',
  attributeNames: {},
  attributes: {},
  required: [],
  reference: [],
};

export const TreeDataInitData = [
  'id',
  'type',
  'title',
  'description',
  'attributeNames',
  'attributes',
  'required',
  'reference',
];

export const attrInitData = {
  id: '',
  title: '',
  type: '',
  dataModels: [],
  description: '',
  valueType: '',
  format: '',
};

export const propertyValueList = [
  'String',
  'Integer',
  'Double',
  'Boolean',
  'Date',
  'Object',
  'ArrayString',
  'ArrayInteger',
  'ArrayDouble',
  'ArrayBoolean',
  'ArrayObject',
  'LINE_STRING',
  'MULTI_LINE_STRING',
  'MULTI_POINT',
  'MULTI_POLYGON',
  'POINT',
  'POLYGON',
];

export const onlyPropertyValueList = [
  'String',
  'Integer',
  'Double',
  'Boolean',
  'Date',
  'Object',
  'ArrayString',
  'ArrayInteger',
  'ArrayDouble',
  'ArrayBoolean',
  'ArrayObject',
];

export const numberValueType = ['Integer', 'Double'];
export const lengthValueType = [
  'String',
  'ArrayString',
  'ArrayInteger',
  'ArrayDouble',
  'ArrayBoolean',
];

export const RelationshipValueList = ['String', 'ArrayString'];
export const GeoPropertyValueList = [
  'LINE_STRING',
  'MULTI_LINE_STRING',
  'MULTI_POINT',
  'MULTI_POLYGON',
  'POINT',
  'POLYGON',
];

export const coreAttrList = ['unitCode', 'observedAt'];

export const childCoreAttrList = ['unitCode', 'observedAt'];
