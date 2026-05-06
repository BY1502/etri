import {
  AttributeForSchemaResType,
  AttributeSchemaPayload,
  AttributeSchemaReqType,
  AttributeSchemaType,
} from 'types/attributeSchema';
import { attributeSchemaAPI } from './config';

export const getAttributeAtAttributeSchema = async (
  attributeSchemaId: string,
): Promise<AttributeForSchemaResType> => {
  const res = await attributeSchemaAPI(attributeSchemaId);
  const data = await res.data;

  return data;
};

export const getAttributeSchema = async (): Promise<AttributeSchemaType[]> => {
  const res = await attributeSchemaAPI('');
  const data = await res.data;
  return data;
};

export const createAttributeSchema = async ({
  reqBody,
}: AttributeSchemaPayload) => {
  const res = await attributeSchemaAPI.post('', reqBody);
  const data = await res.data;

  return data;
};

export const updateAttributeSchema = async (
  reqBody: AttributeSchemaReqType,
) => {
  const res = await attributeSchemaAPI.put('', reqBody);
  const data = await res.data;

  return data;
};

export const deleteAttributeSchema = async (attributeSchemaId: string) => {
  const res = await attributeSchemaAPI.delete(attributeSchemaId);
  const data = await res.data;
  return data;
};
