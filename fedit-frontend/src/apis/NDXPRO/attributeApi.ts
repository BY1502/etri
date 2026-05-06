import { AttrListItemType } from 'types/attribute';
import {
  DataManagerPageResponseDTO,
  IModelAttributeAsideSearch,
} from 'types/common';
import { attributeAPI as API } from './config';

export const getAttrData1 = async () => {
  const response = await API.get(`/attributes`);
  const { data } = response;
  return data;
};

export const getSchemaItems = async (schemaProp: any) => {
  const response = await API.get(`/attributes/bundle`, {
    params: { schemaId: schemaProp },
  });
  const { data } = response;
  return data;
};

export const getAttrData = async (idParam: any) => {
  const response = await API.get(`/attributes/${idParam}`);
  const { data } = response;
  return data;
};

export const getAllAttrWithPage = async (
  payload: IModelAttributeAsideSearch,
): Promise<DataManagerPageResponseDTO<AttrListItemType>> => {
  const response = await API.get(`/attributes`, {
    params: payload,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const { data } = response;
  return data;
};

export const getAttrPage = async (num: number) => {
  const response = await API.get(`/attributes/specific/${num}`);
  const { data } = response;
  return data;
};
export const getUsingDataModel = async (attributeId: string) => {
  const response = await API.get(`attributes/usingModel/${attributeId}`);
  return response.data;
};

export const postAttrData = async (attrJsonData: any) => {
  const response = await API.post(`/attributes`, JSON.stringify(attrJsonData), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const { data } = response;
  return data;
};

export const putAttrData = async (attrJsonData: any) => {
  const response = await API.put(`/attributes/`, JSON.stringify(attrJsonData), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const { data } = response;
  return data;
};

export const deleteAttrData = async (attributeId: any) => {
  const response = await API.delete(`/attributes/${attributeId}`);
  const { data } = response;
  return data;
};

export const getAttributeSchema = async (schemaId: string) => {
  const response = await API.get(`/attribute-schemata/${schemaId}`);
  const { data } = response;
  return data;
};

export const getAllAttributeSchema = async () => {
  const response = await API.get(`/attribute-schemata/`);
  const { data } = response;
  return data;
};

// ////////////////////////////

export const postSchemaData = async (
  schemaProp: string,
  contextProp: string,
  attrNameProp: string,
) => {
  const response = await API.post(`/registration/attributes`, null, {
    params: {
      schemaId: schemaProp,
      contextUrl: contextProp,
      attributeName: attrNameProp,
    },
  });
  const { data } = response;
  return data;
};
