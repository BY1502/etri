export interface IDataModel {
  id: string;
  type: string;
  title?: string;
  description?: string;
  attributeNames: any;
  attributes: any;
  required?: string[];
  isDynamic?: boolean;
  isReady: boolean;
  observation?: string[];
  createdAt?: string;
  modifiedAt?: string;
  reference?: string[];
}

interface IDataModelAttributeValid {
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export type TvalueType =
  | 'String'
  | 'Integer'
  | 'Double'
  | 'Boolean'
  | 'Date'
  | 'Object'
  | 'ArrayString'
  | 'ArrayInteger'
  | 'ArrayDouble'
  | 'ArrayBoolean'
  | 'ArrayObject'
  | 'LINE_STRING'
  | 'MULTI_LINE_STRING'
  | 'MULTI_POINT'
  | 'MULTI_POLYGON'
  | 'POINT'
  | 'POLYGON'
  | undefined;

export interface IDataModelAttribute {
  type?: 'Property' | 'GeoProperty' | 'Relationship' | string;
  valueType?: TvalueType;
  description?: string;
  valid?: IDataModelAttributeValid;
  format?: string;
  modelType?: string[];
  enum?: string[];
  objectMember?: any;
  childAttributeNames?: any;
  childAttributes?: any;
}

export interface IDataModelAttributeFormat {
  id: string;
  value: IDataModelAttribute;
  name: string;
  toggle: boolean;
}
