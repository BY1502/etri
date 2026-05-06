import {
  ContextModelDTO,
  ContextVersionRequest,
  ContextVersionResponse,
} from 'types/context';
import { managerAPI as API } from './config';
// import { setupInterceptorsTo } from '../utils/interceptors';

// setupInterceptorsTo(API);

//* Context 데이터 API 템플릿
export const getContextData = async () => {
  try {
    const response = await API.get(`/contexts`);
    const { data } = response;
    return data;
  } catch (err) {
    return err;
  }
};

export const getContextVersion = async (config: ContextVersionRequest) => {
  const response = await API.get<ContextVersionResponse>(
    '/contexts/version',
    config,
  );
  return response.data;
};

export const getContextVone = async () => {
  const response = await API.get<ContextVersionResponse>('/context/v1');
  return response.data;
};

export const getContextMetaInfoData = async ({ contextUrl }: any) => {
  try {
    const response = await API.get(`/context/full`, {
      params: { contextUrl },
    });
    const { data } = response;
    return data['@context'];
  } catch (err) {
    throw new Error('Err!!');
  }
};
// 에러 발생
export const getContextInfoData = async ({ contextUrl }: any) => {
  const response = await API.get(`/context`, { params: { contextUrl } });
  const { data } = response;
  return data['@context'];
};

export const getContextDetailData = async (contextUrl: string) => {
  const response = await API.get(`/context`, { params: { contextUrl } });
  const { data } = response;
  return data;
  // const result = data['@context'] ? Object.keys(data['@context']) : [];
  // const status = data.dataModelStatus
  //   ? Object.entries(data.dataModelStatus)
  //   : [];
  // console.log(status, 'status');
  // return result;
};

export const createContextData = async (reqBody: ContextModelDTO) => {
  const response = await API.post(`/contexts`, reqBody);
  const { data } = response;
  return data;
};

export const createContextData2 = async (contextUrl: any, contextData: any) => {
  const response = await API.post(`/contexts`, contextData, {
    params: { contextUrl },
  });
  const { data } = response;
  return data;
};

export const AddContextModelData = async (
  contextUrl: string,
  contextData: string[],
) => {
  const response = await API.put(`/contexts/models/enrollment`, contextData, {
    params: { contextUrl },
  });
  const { data } = response;
  return data;
};

export const SubContextModelData = async (
  contextUrl: string,
  contextData: string[],
) => {
  const response = await API.put(
    `/contexts/models/un-enrollment`,
    contextData,
    {
      params: { contextUrl },
    },
  );
  const { data } = response;
  return data;
};

export const updateContextData = async (contextUrl: any, contextData: any) => {
  try {
    const response = await API.put(`/`, contextData, {
      params: { contextUrl },
    });
    const { data } = response;
    return data;
  } catch (err) {
    throw new Error('Err!!');
  }
};

export const deleteContextData = async (contextUrl: any) => {
  try {
    const response = await API.delete(`/contexts`, {
      params: { contextUrl },
    });
    const { data } = response;
    return data;
  } catch (err) {
    throw new Error('Err!!');
  }
};

export const changeStatusContext = async (contextUrl: string) => {
  const temp = {};
  try {
    const response = await API.put(`/contexts/readiness`, temp, {
      params: { contextUrl },
    });
    const { data } = response;
    return data;
  } catch (err) {
    throw new Error('Err!!');
  }
};
