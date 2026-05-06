export interface agentDTO {
  id: number;
  name: string;
  status: string;
}

export interface agentVO {
  id: number;
  name: string;
  models: agentModel[];
  status: string;
  topic: string;
  type: string;
  lastSinkSignalReceivedAt: string;
  lastSourceSignalReceivedAt: string;
  pid: number;
  confFileContents: string;
  isCustomTopic: boolean;
  urlAddress: string;
  connTerm: string;
  method: string;
}

export interface agentHistoryVO {
  id: number;
  agentId: number;
  agentName: string;
  agentStatus: string;
  operatedBy: string;
  operatedAt: string;
}

export interface agentModel {
  context: string;
  modelType: string;
}

export interface ReqGetAgentModelAttributeSources {
  modelType: string;
}

export interface AgentModelAttributeSource {
  id: number;
  attributeName: string;
  sourceName: string;
  modelType: string;
}

export type ResGetAgentModelAttributeSources = AgentModelAttributeSource[];

export interface ReqPostAgentModelAttributeSource {
  modelType: string;
  attributeName: string;
  sourceName: string;
}

export interface ResPostAgentModelAttributeSource {
  id: number;
  attributeName: string;
  sourceName: string;
  modelType: string;
}
