// import { setupInterceptorsTo } from 'utils/interceptors';
import {
  TranslatorCompileRequest,
  TranslatorCompileResponse,
  TranslatorControlRequest,
  TranslatorCreateRequest,
  TranslatorsRequestParams,
  TranslatorsResponse,
  TranslatorType,
} from 'types/translator';
import { translatorAPI } from './config';

// setupInterceptorsTo(translatorAPI);

export const postTranslatorCompile = async (
  payload: TranslatorCompileRequest,
): Promise<TranslatorCompileResponse> => {
  const res = await translatorAPI.post('translators/compile', payload);
  const data = await res.data;
  return data;
};

export const createTranslator = async (payload: TranslatorCreateRequest) => {
  const res = await translatorAPI.post('translators', payload);
  const data = await res.data;
  return data;
};

export const getTranslators = async (
  payload: TranslatorsRequestParams,
): Promise<TranslatorsResponse> => {
  const res = await translatorAPI.get('translators', { params: payload });
  const data = await res.data;
  return data;
};

export const patchTranslatorControl = async (
  translatorId: number,
  payload: TranslatorControlRequest,
): Promise<TranslatorType> => {
  const res = await translatorAPI.patch(`translators/${translatorId}`, payload);
  const data = await res.data;
  return data;
};

export const deleteTranslator = async (translatorId: number) => {
  const res = await translatorAPI.delete(`translators/${translatorId}`);
  const data = await res.data;
  return data;
};

export const getTranslatorSample = async (translatorName: string) => {
  const res = await translatorAPI.get('translators/sample', {
    params: {
      name: translatorName,
    },
  });

  const data = await res.data;
  return data;
};
