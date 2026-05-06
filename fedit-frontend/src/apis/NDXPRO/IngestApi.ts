// import { setupInterceptorsTo } from 'components/utils/interceptors';
import {
  agentVO,
  ReqGetAgentModelAttributeSources,
  ReqPostAgentModelAttributeSource,
  ResGetAgentModelAttributeSources,
  ResPostAgentModelAttributeSource,
} from 'types/ingest';
import { IngestAPI as API } from './config';

// setupInterceptorsTo(API);

interface payload {
  curPage: number;
  size?: number;
  name?: string;
  status?: string;
}

export const getAgentList = async (payload: payload) =>
  // : Promise<agentDTO[]>
  {
    const response = await API.get('/agents', {
      params: payload,
    });
    const { data } = response;
    return data;
  };

export const getAgentHistoryList = async (payload: payload) => {
  const response = await API.get('/histories', {
    params: payload,
  });
  const { data } = response;
  return data;
};

export const getAgentDetail = async (agentName: string) => {
  const response = await API.get(`/agent`, {
    params: {
      name: agentName,
    },
  });
  const { data } = response;
  return data;
};

export const postAgentData = async (payload: agentVO) => {
  const response = await API.post(`/agents`, payload);
  const { data } = response;
  return data;
};

export const deleteAgent = async (agentId: number) => {
  const response = await API.delete(`/agents/${agentId}`);
  const { data } = response;
  return data;
};

export const patchAgentStatus = async (agentId: number, operation: string) => {
  const response = await API.patch(`/agents/${agentId}`, {
    operation,
  });
  const { data } = response;
  return data;
};

export const putAgentData = async (agentId: number, payload: agentVO) => {
  const response = await API.put(`/agents/${agentId}`, payload);
  const { data } = response;
  return data;
};

export const getAgentModelAttributeSources = async (
  agentId: number,
  payload: ReqGetAgentModelAttributeSources,
) => {
  const response = await API.get<ResGetAgentModelAttributeSources>(
    `/agents/${agentId}/attribute-sources`,
    {
      params: payload,
    },
  );

  const { data } = response;
  return data;
};

export const postAgentModelAttributeSource = async (
  agentId: number,
  payload: ReqPostAgentModelAttributeSource,
) => {
  const response = await API.post<ResPostAgentModelAttributeSource>(
    `/agents/${agentId}/attribute-sources`,
    payload,
  );

  const { data } = response;
  return data;
};

export const deleteAgentModelAttributeSource = async (
  agentId: number,
  attributeSourceId: number,
) => {
  const response = await API.delete(
    `/agents/${agentId}/attribute-sources/${attributeSourceId}`,
  );

  const { data } = response;
  return data;
};
