import { IModelAttributeAsideSearch } from 'types/common';
import { DataModelGetResponse } from 'types/model';
import { managerAPI as API } from './config';

export const getUnitCodeGroup = async () => {
  const response = await API.get(`unit-code/`);
  const { data } = response;
  return data;
};

export const getUnitCode = async (group?: string) => {
  const response = await API.get(`unit-code/${group}`);
  const { data } = response;
  return data;
};

export const getAllModelWithPage = async (
  payload: IModelAttributeAsideSearch,
) => {
  const response = await API.get(`data-models`, {
    params: payload,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const { data } = response;
  return data;
};

export const getModel = async ({
  dataModelId,
}: {
  dataModelId: string | undefined;
}): Promise<DataModelGetResponse> => {
  const response = await API.get(`data-models/${dataModelId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const { data } = response;
  return data;
};

export const postModelData = async (modelData: any) => {
  const response = await API.post(`/data-models`, JSON.stringify(modelData), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const { data } = response;
  return data;
};

export const putModel = async (modelIdProp: any, attrJsonData: any) => {
  const response = await API.put(
    `/data-models/`,
    JSON.stringify(attrJsonData),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
  const { data } = response;
  return data;
};

export const deleteModel = async (dataModelId: any) => {
  const response = await API.delete(`/data-models/${dataModelId}`);
  const { data } = response;
  return data;
};

export const putIsReady = async (dataModelId: string) => {
  const response = await API.put(`/data-models/readiness/${dataModelId}`);
  const { data } = response;
  return data;
};

export const getCheckTypeDuplicate = async (dataModelId: string) => {
  const response = await API.get(`/data-models/check-duplicate/${dataModelId}`);
  const { data } = response;
  return data;
};

/* === 사용하지 않음 === */
export const getAllModelGroup = async () => {
  const response = await API.get(`data-models`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const { data } = response;
  return data;
};

export const getModelGroup = async ({ groupId }: any) => {
  const response = await API.get(`/category/${groupId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const { data } = response;
  return data;
};
