export interface EntityRequestHeaderType {
  Link: string;
}
export interface entityDTO {
  id: string;
}

export interface RelationshipInfoType {
  entities: string[];
  relationshipValue: string;
}

export interface EntitiesRequestType {
  params: EntitiesRequestParamsType;
  headers: EntityRequestHeaderType;
}

export interface EntityDetailRequestType {
  headers: EntityRequestHeaderType;
}

export interface EntitiesRequestParamsType {
  type: string;
  q?: string;
  offset?: number;
  limit?: number;
  sort?: string;
  sortproperty?: string;
}

export interface EntityHistoryRequestType {
  params: EntityHistoryRequestParamsType;
  headers: EntityRequestHeaderType;
}

export interface EntityHistoryRequestParamsType {
  entityId: string;
  timeproperty: string;
  timerel?: TimerelType;
  time?: string;
  endTime?: string;
  q?: string;
  offset?: number;
  limit?: number;
  sort?: string;
  sortproperty?: string;
}

export interface EntitiyInfoType {
  provider: string;
  entityId: string;
}

export interface EntitiesResponseType {
  context: string;
  model: string;
  entities: EntitiyInfoType[];
  totalData: number;
  totalPage: number;
}

export interface NGSILDType {
  id: string;
  type: string;
  '@context': string;
  [key: string]: any;
}
export interface EntityDetailType {
  provider: string;
  entity: NGSILDType;
}
export interface EntityHistoryType {
  context: string;
  timeproperty: string;
  totalPage: number;
  totalData: number;
  entityHistoryList: EntityHistoryDto[];
}
export interface EntityHistoryDto {
  entityId: string;
  historyId: string;
  observedAt: string;
  provider: string;
}

export interface EntityHistoryDetailType {
  historyId: string;
  timeproperty: string;
  observedAt: string;
  provider: string;
  entity: NGSILDType;
}

export interface EntityHistoryDetailRequestType {
  params: {
    timeproperty: string;
  };
}

export type ValueType =
  | 'String'
  | 'Enum'
  | 'Integer'
  | 'Double'
  | 'Boolean'
  | 'Object'
  | 'ArrayString'
  | 'ArrayInteger'
  | 'ArrayDouble'
  | 'ArrayBoolean'
  | 'DateTime'
  // geo property
  | 'POINT'
  | 'MULTI_POINT'
  | 'LINE_STRING'
  | 'MULTI_LINE_STRING'
  | 'POLYGON'
  | 'MULTI_POLYGON'
  | '';

export type CriteriaInfoTypeList = CriteriaInfoType[];

export interface CriteriaInfoType {
  criteria: string;
  valueType: ValueType;
  type: 'Property' | 'Relationship' | 'Geoproperty' | undefined;
}

export interface EntityTabType {
  title: string; // entity id
  subTitle?: string; // observedAt
  contextId: string;
  modelId: string;
  entityId: string;
  historyId?: string;
  detailId: string; // entity id or history id
  searchInfo: EntitySearchInfoType;
}

/**
 * 추가적인 Route는 사용자의 클릭 이벤트에 따라 결정
 * entityTab에서 결정됨
 */
export interface EntityRouteInfo {
  contextId?: string;
  modelId?: string;
  entityId?: string;
  historyId?: string;
}

export interface SearchCriteriaInfoType {
  criteria: string;
  valueType: ValueType;
  value: string;
}

export interface SearchCriteriaInfoAction {
  reset: () => void;
  set: (newSearchCriteriaInfo: SearchCriteriaInfoType) => void;
  setValue: (newValue: string) => void;
  setCriteria: ({
    criteria,
    valueType,
  }: {
    criteria: string;
    valueType: ValueType;
  }) => void;
}

export interface EntitySearchInfoType {
  observedTimeInfo?: ObservedTimeInfoType;
  criteriaInfo1?: SearchCriteriaInfoType;
  criteriaInfo2?: SearchCriteriaInfoType;
}

export interface EntitySearchInfoAction {
  set: (newSearchInfo: EntitySearchInfoType) => void;
  concat: (newSearchInfo: EntitySearchInfoType) => void;
  setCriteriaInfo1: (searchCriteriaInfo: SearchCriteriaInfoType) => void;
  setCriteriaInfo2: (searchCriteriaInfo: SearchCriteriaInfoType) => void;
  setObservedTimeInfo: (ObservedTimeInfo: ObservedTimeInfoType) => void;
  setPropertyInfo: (property: string, valueType: ValueType) => void;
  resetForStatic: () => void;
  resetForDynamic: (property: string, valueType: ValueType) => void;
}

export type ModelInfoReturnTypeForEntity =
  | {
      isDynamic: boolean;
      timePropertyList: string[];
      searchCriteriaInfoList: CriteriaInfoTypeList;
      modelId: string;
    }
  | undefined;

export interface ObservedTimeInfoType {
  property: string;
  startTime: string;
  endTime: string;
  timerel?: TimerelType;
  value: string;
  valueType: ValueType;
}

export interface ObservedTimeInfoAction {
  reset: () => void;
  set: (newInfo: ObservedTimeInfoType) => void;
  setStartTime: (startTime: string, timerel: TimerelType) => void;
  setEndTime: (endTime: string, timerel: TimerelType) => void;
  setValue: (value: string) => void;
}

export type TimerelType = 'between' | 'before' | 'after' | undefined;
