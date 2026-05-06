export type TranslatorStatus =
  | 'DELETED'
  | 'HANG'
  | 'DIE'
  | 'CREATED'
  | 'STOP'
  | 'RUN';

export interface TranslatorType {
  id: number;
  agentId: number;
  name: string;
  translateCode: string;
  modelType: string;
  status: TranslatorStatus;
  pid: number | null;
  lastSignalDatetime: string | null;
  sourceTopic: string;
  targetTopic: string;
  transferObservedAt: boolean;
  observedAtTopicScenarioId: number | null;
  observedAtTopicScenarioType: string | null;
  isReady: boolean;
  createdAt: string;
  modifiedAt: string;
}
export interface TranslatorCreateRequest {
  agentId: number;
  name: string;
  translateCode: string;
  modelType: string;
  context: string;
  isCustomTopic: boolean;
  sourceTopic: string;
  transferObservedAt?: boolean;
  observedAtTopicScenarioId?: number;
  observedAtTopicScenarioType?: string;
}

export interface TranslatorCompileRequest {
  name: string;
  translateCode: string;
}

export interface TranslatorCompileResponse {
  exitCode: number;
  output: string;
  error: null | string;
  savedFilePath: null | string;
  savedFile: null | string[];
}

export interface TranslatorsRequestParams {
  agentId: number;
  curPage?: number;
  size?: number;
}

export interface TranslatorsResponse {
  data: TranslatorType[];
  totalData: number;
  totalPage: number;
}

export interface TranslatorControlRequest {
  operation: 'run' | 'stop';
}
