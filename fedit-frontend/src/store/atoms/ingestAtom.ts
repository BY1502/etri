import { atom } from 'recoil';
import { agentModel, agentVO } from 'types/ingest';

export const agentState = atom<agentVO>({
  key: 'agentState',
  default: {
    id: 0,
    name: '',
    models: [],
    status: '',
    topic: '',
    type: 'HTTP',
    method: 'GET',
    lastSinkSignalReceivedAt: '',
    lastSourceSignalReceivedAt: '',
    pid: 0,
    confFileContents: '',
    isCustomTopic: false,
    urlAddress: '',
    connTerm: '',
  },
});

export const agentModelState = atom<agentModel[]>({
  key: 'agentModelState',
  default: [],
});

export type AgentMode = 'read' | 'add' | 'edit';

export const agentModeState = atom<AgentMode>({
  key: 'agentMode',
  default: 'read',
});
