import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EntityTabType } from 'types/entity';
import { TreeHistoryType } from 'types/entityTree';
import { useSetActiveEntityTab } from './useActiveEntityTab';
import { useSetTreeHistory } from './useTreeHistory';

function includeEntityTabList(
  entityTabList: EntityTabType[],
  detailId: string,
) {
  return entityTabList.map((el) => el.detailId).includes(detailId);
}

interface EntityTabListActionType {
  append: (newEntityTab: EntityTabType) => void;
  remove: (entityDetailId: string) => void;
}

function useEntityTabList(): [EntityTabType[], EntityTabListActionType] {
  const [entityTabList, setEntityTabList] = useState<EntityTabType[]>([]);
  const setActiveEntityTab = useSetActiveEntityTab() as Dispatch<
    SetStateAction<EntityTabType>
  >;
  const setTreeHistory = useSetTreeHistory() as Dispatch<
    SetStateAction<TreeHistoryType[]>
  >;

  const param = useParams();
  const navigate = useNavigate();

  const entityTabListAction = {
    append: (newEntityTab: EntityTabType) => {
      if (!includeEntityTabList(entityTabList, newEntityTab.detailId)) {
        setEntityTabList((prev) => [...prev, newEntityTab]);
        setTreeHistory((prev) => {
          return [
            ...prev,
            {
              treeHistoryId: newEntityTab.detailId,
              treeHistory: {},
            },
          ];
        });
      }
    },
    remove: (entityDetailId: string) => {
      setEntityTabList((prevEntityTabList) => {
        return prevEntityTabList.filter(
          (tabInfo) => tabInfo.detailId !== entityDetailId,
        );
      });
      setTreeHistory((prev) => {
        return prev.filter((el) => el.treeHistoryId !== entityDetailId);
      });
    },
  };

  useEffect(() => {
    const pathInfo = param['*'];
    if (pathInfo === undefined) return;
    const detailId = pathInfo.split('/').at(-1) as string;

    // TODO: Active Entity tab 변경 로직 추가
    if (entityTabList.length === 0) {
      // entity tab이 비어있는 경우
      // console.log('data not found at useEntityTabList');
      navigate(`/service-description-tool/entity-management`);
    } else if (!includeEntityTabList(entityTabList, detailId)) {
      // active된 탭이 닫힌 경우 (동적, 정적인지 확인 후 url 생성)
      const endIdx = entityTabList.length - 1;
      const lastEntityTab = entityTabList[endIdx];
      const contextIdRoute = encodeURIComponent(lastEntityTab.contextId);
      const modelIdRoute = lastEntityTab.modelId;
      const entityIdRoute = encodeURIComponent(lastEntityTab.entityId);

      const routeURL = lastEntityTab.historyId
        ? `/service-description-tool/entity-management/${contextIdRoute}/${modelIdRoute}/${entityIdRoute}/${lastEntityTab.historyId}`
        : `/service-description-tool/entity-management/${contextIdRoute}/${modelIdRoute}/${entityIdRoute}`;

      navigate(routeURL);
      setActiveEntityTab(lastEntityTab);
    }
  }, [entityTabList]);

  return [entityTabList, entityTabListAction];
}

export default useEntityTabList;
