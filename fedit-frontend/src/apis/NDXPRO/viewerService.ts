import { viewerAPI } from './config';

export const getFdtTourData = async (
  federatedDigitalObjectId: string,
  secretKey: string,
  measurePositionId?: string, // Optional param
) => {
  const response = await viewerAPI.get('', {
    params: {
      federated_digital_object_id: federatedDigitalObjectId,
      secret_key: secretKey,
      measure_position_id: measurePositionId,
    },
  });

  return response.data;
};
