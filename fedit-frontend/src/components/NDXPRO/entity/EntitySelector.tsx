import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import {
  CriteriaInfoTypeList,
  EntityTabType,
  ModelInfoReturnTypeForEntity,
} from 'types/entity';

import { getModel } from 'apis/NDXPRO/modelApi';
import ErrorContent from 'components/NDXPRO/common/error';
import { useEntityRouteInfo } from 'components/NDXPRO/hooks/useEntityRouteInfo';
import useEntitySearchInfo from 'components/NDXPRO/hooks/useEntitySearchInfo';
import EntityHistory from './EntityHistory';
import EntityList from './EntityList';

interface IProps {
  appendEntityTabList: (newEntityTab: EntityTabType) => void;
}

function EntitySelector({ appendEntityTabList }: IProps) {
  const navigate = useNavigate();
  const routeInfo = useEntityRouteInfo();
  const [searchInfo, searchInfoAction] = useEntitySearchInfo();
  const [isEntityHistory, setIsEntityHistory] = useState(false);

  const [targetEntityId, setTargetEntityId] = useState('');
  const [dataNotFound, setDataNotFound] = useState(false);

  const showEntityHistory = (entityId: string) => {
    setTargetEntityId(entityId);
    setIsEntityHistory(true);
  };

  const showEntityList = () => {
    setIsEntityHistory(false);
  };

  useEffect(() => {
    setDataNotFound(false);
    const isDynamic = routeInfo.historyId !== undefined;
    setIsEntityHistory(isDynamic);
    if (routeInfo.entityId !== undefined) {
      setTargetEntityId(routeInfo.entityId);
    }
  }, [routeInfo]);

  const getModelInfo = async (
    isHistory: boolean,
  ): Promise<ModelInfoReturnTypeForEntity> => {
    try {
      const response = await getModel({
        dataModelId: routeInfo.modelId,
      });

      const { isDynamic, observation, attributeNames, type } = response;
      const searchCriteriaInfoList: CriteriaInfoTypeList = [];

      if (isHistory === false) {
        searchCriteriaInfoList.push({
          criteria: '_id.id',
          valueType: 'String',
          type: undefined,
        });

        searchCriteriaInfoList.push({
          criteria: '_id.servicePath',
          valueType: 'String',
          type: undefined,
        });
      } else {
        searchCriteriaInfoList.push({
          criteria: `${observation[0]}.observedAt`,
          valueType: 'DateTime',
          type: undefined,
        });
      }

      const attributeKeys = Object.keys(attributeNames);
      attributeKeys.forEach((attribute) => {
        searchCriteriaInfoList.push({
          criteria: attribute,
          valueType: response.attributes[attribute].valueType,
          type: response.attributes[attribute].type,
        });
      });

      return {
        isDynamic,
        timePropertyList: observation,
        searchCriteriaInfoList,
        modelId: type,
      };
    } catch (error) {
      console.log(error);
      setDataNotFound(true);
      return undefined;
    }
  };

  useEffect(() => {
    if (dataNotFound) {
      console.log('data not found');
    }
  }, [dataNotFound]);

  return (
    <div
      className="entity-selector"
      style={{ width: dataNotFound ? '100%' : '' }}
    >
      {dataNotFound ? (
        <ErrorContent errMsg="해당 Context에 Data Model이 존재하지 않습니다." />
      ) : (
        <div>
          {!isEntityHistory ? (
            <EntityList
              searchInfo={searchInfo}
              searchInfoAction={searchInfoAction}
              getModelInfo={getModelInfo}
              showEntityHistory={showEntityHistory}
              appendEntityTabList={appendEntityTabList}
            />
          ) : (
            <EntityHistory
              targetEntityId={targetEntityId}
              searchInfo={searchInfo}
              searchInfoAction={searchInfoAction}
              getModelInfo={getModelInfo}
              showEntityList={showEntityList}
              appendEntityTabList={appendEntityTabList}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default EntitySelector;
