import {
  EntitiesRequestType,
  EntitiesResponseType,
  EntityDetailRequestType,
  EntityDetailType,
  EntityHistoryDetailRequestType,
  EntityHistoryDetailType,
  EntityHistoryRequestType,
  EntityHistoryType,
} from 'types/entity';
// import { setupInterceptorsTo } from 'utils/interceptors';
import { entityAPI } from './config';

// setupInterceptorsTo(entityAPI);

const helperFetcher = async <Request, Response>(
  endpoint: string,
  config?: Request,
): Promise<Response> => {
  const res = config
    ? await entityAPI.get(endpoint, config)
    : await entityAPI.get(endpoint);
  const data = await res.data;
  return data;
};

export const getEntities = async (
  config: EntitiesRequestType,
): Promise<EntitiesResponseType> => {
  return helperFetcher<EntitiesRequestType, EntitiesResponseType>('', config);
};

export const getEntityDetail = async (
  entityId: string,
  config: EntityDetailRequestType,
): Promise<EntityDetailType> => {
  return helperFetcher<EntityDetailRequestType, EntityDetailType>(
    entityId,
    config,
  );
};

export const getIotEntities = async (
  config: EntitiesRequestType,
): Promise<EntitiesResponseType> => {
  return helperFetcher<EntitiesRequestType, EntitiesResponseType>(
    'iot',
    config,
  );
};

export const getIotEntityHistory = async (
  config: EntityHistoryRequestType,
): Promise<EntityHistoryType> => {
  return helperFetcher<EntityHistoryRequestType, EntityHistoryType>(
    'iot/history',
    config,
  );
};

export const getIotEntityDetail = async (
  historyId: string,
  config: EntityHistoryDetailRequestType,
): Promise<EntityHistoryDetailType> => {
  return helperFetcher<EntityHistoryDetailRequestType, EntityHistoryDetailType>(
    `iot/history/${historyId}`,
    config,
  );
};
