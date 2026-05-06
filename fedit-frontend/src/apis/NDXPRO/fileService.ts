import { fileServiceAPI } from './config';

export const getLogicalFilesUFID = async (filename: string) => {
  const response = await fileServiceAPI.get(
    `/logical-files?filename=${filename}`,
  );
  const { data } = response;
  return data;
};

export const getDownloadFiles = async (ufid: string, config = {}) => {
  // Use config parameter for additional options like onDownloadProgress
  const response = await fileServiceAPI.get(`/files/${ufid}`, {
    ...config,
    responseType: 'blob', // Make sure response is handled as a binary blob
  });
  return response;
};
