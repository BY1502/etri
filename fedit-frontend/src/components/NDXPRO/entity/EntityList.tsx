import LoadingIcon from 'assets/images/refresh.svg';

import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { getEntities, getIotEntities } from 'apis/NDXPRO/dataServiceApi';
import {
  useActiveEntityTab,
  useSetActiveEntityTab,
} from 'components/NDXPRO/hooks/useActiveEntityTab';
import useDidMountEffect from 'components/NDXPRO/hooks/useDidMountEffect';
import { useEntityRouteInfo } from 'components/NDXPRO/hooks/useEntityRouteInfo';
import useScrollObserver from 'components/NDXPRO/hooks/useScrollObserver';
import {
  CriteriaInfoTypeList,
  EntitiesRequestParamsType,
  EntitiesRequestType,
  EntitiyInfoType,
  EntityRequestHeaderType,
  EntitySearchInfoAction,
  EntitySearchInfoType,
  EntityTabType,
  ModelInfoReturnTypeForEntity,
} from 'types/entity';
import { ErrorResponseType } from 'types/error';
import { qQueryGenerator } from 'utils/generator';
import EntitySearchForm from './searchForm/EntitySearchForm';

interface IProps {
  searchInfo: EntitySearchInfoType;
  searchInfoAction: EntitySearchInfoAction;
  getModelInfo: (isHistory: boolean) => Promise<ModelInfoReturnTypeForEntity>;
  showEntityHistory: (entityId: string) => void;
  appendEntityTabList: (newEntityTab: EntityTabType) => void;
}

function EntityList({
  searchInfo,
  searchInfoAction,
  getModelInfo,
  showEntityHistory,
  appendEntityTabList,
}: IProps) {
  const [entitiesData, setEntitiesData] = useState<EntitiyInfoType[]>([]);

  const {
    observedRef,
    isLoading: isScrollLoading,
    observerController,
  } = useScrollObserver();
  const [isEnableScroll, setIsEnableScroll] = useState(true);
  const ulRef = useRef<HTMLUListElement>(null);
  const [pageLimit, setPageLimit] = useState(0);
  const [pageCnt, setPageCnt] = useState(0);

  const [isDynamic, setIsDynamic] = useState<boolean | null>(null);
  const [searchCriteriaInfoList, setSearchCriteriaInfoList] =
    useState<CriteriaInfoTypeList>([]);

  const routeInfo = useEntityRouteInfo();
  const setActiveEntityTab = useSetActiveEntityTab();

  const updateEntitiesData = async (
    config: EntitiesRequestType,
    isInit: boolean,
  ) => {
    try {
      const data = isDynamic
        ? await getIotEntities(config)
        : await getEntities(config);

      setEntitiesData((prev) => {
        return isInit ? data.entities : [...prev, ...data.entities];
      });

      if (data.entities.length === 0 || pageLimit > data.entities.length) {
        setIsEnableScroll(false);
        observerController.stopObserver();
      }
    } catch (err) {
      let errMsg = 'err';

      if (axios.isAxiosError(err)) {
        const errorResponse = err.response?.data as ErrorResponseType;
        errMsg = errorResponse.title;
      }
      alert('오류가 발생하였습니다. 개발팀에 문의주세요.');
      console.log(errMsg);
    }
  };

  const generateRequestConfig = (pageCnt: number): EntitiesRequestType => {
    const { criteriaInfo1, criteriaInfo2 } = searchInfo;

    const headers: EntityRequestHeaderType = {
      Link: `<${routeInfo.contextId}>`,
    };
    const params: EntitiesRequestParamsType = {
      type: routeInfo.modelId as string,
      offset: pageCnt,
      limit: pageLimit,
    };

    try {
      const excludeList = ['.observedAt'];

      const qQuery =
        qQueryGenerator(
          criteriaInfo1?.criteria,
          criteriaInfo1?.valueType,
          criteriaInfo1?.value,
          excludeList,
        ) +
        qQueryGenerator(
          criteriaInfo2?.criteria,
          criteriaInfo2?.valueType,
          criteriaInfo2?.value,
          excludeList,
        );

      if (qQuery) {
        params.q = qQuery;
      }
    } catch (error) {
      alert((error as Error).message);
    }

    return {
      params,
      headers,
    };
  };

  const activeTab = useActiveEntityTab();

  const initStaties = async () => {
    const response = await getModelInfo(false);
    if (ulRef.current === null || response === undefined) return;

    ulRef.current.scroll({ top: 0 });
    const pageLimit = Math.round(ulRef.current.offsetHeight / 28) + 3;

    const staticSearchCriteriaInfoList = response.searchCriteriaInfoList.filter(
      (searchCriteriaInfo) =>
        !response.timePropertyList.includes(searchCriteriaInfo.criteria),
    );

    if (activeTab.modelId === response.modelId) {
      searchInfoAction.set(activeTab.searchInfo);
    } else {
      searchInfoAction.resetForStatic();
    }

    setIsDynamic(response.isDynamic);
    setSearchCriteriaInfoList(staticSearchCriteriaInfoList);
    setPageLimit(pageLimit);
    setEntitiesData([]);
    setPageCnt(0);
    setIsEnableScroll(true);
  };

  // init
  useEffect(() => {
    (async () => {
      await initStaties();
    })();
  }, [routeInfo.contextId, routeInfo.modelId, routeInfo.entityId]);

  // observed target element
  useEffect(() => {
    if (isEnableScroll === true) {
      observerController.startObserver();
    }
  }, [isEnableScroll]);

  // infinite scroll logic
  useEffect(() => {
    if (isScrollLoading === true && pageLimit !== 0) {
      const isInit = pageCnt === 0;
      const config = generateRequestConfig(pageCnt);

      updateEntitiesData(config, isInit);
      setPageCnt((prev) => prev + 1);
    }
  }, [isScrollLoading, pageLimit]);

  // search logic
  useDidMountEffect(() => {
    if (pageLimit !== 0) {
      setEntitiesData([]);
      updateEntitiesData(generateRequestConfig(0), true);
      setPageCnt(1);
      setIsEnableScroll(true);
    }
  }, [searchInfo]);

  const anchorClickHandler = (entityId: string) => {
    const { contextId, modelId } = routeInfo;
    if (
      contextId === undefined ||
      modelId === undefined ||
      setActiveEntityTab === undefined
    )
      return;

    const newEntityTab: EntityTabType = {
      title: entityId,
      contextId,
      modelId,
      entityId,
      detailId: entityId,
      searchInfo,
    };

    setActiveEntityTab(newEntityTab);
    appendEntityTabList(newEntityTab);
  };

  const generateNextRouteUrl = (entityId: string) => {
    const contextRoute = encodeURIComponent(routeInfo.contextId as string);
    const dataModelRoute = routeInfo.modelId as string;
    const entityIdRoute = encodeURIComponent(entityId);
    return `${contextRoute}/${dataModelRoute}/${entityIdRoute}`;
  };

  return (
    <div className="entity-list">
      <div className="header-wrapper">
        <h3>{routeInfo.modelId}</h3>
      </div>
      <EntitySearchForm
        searchInfo={searchInfo}
        searchInfoAction={searchInfoAction}
        searchCriteriaInfoList={searchCriteriaInfoList}
        isDynamic={isDynamic}
      />
      <ul ref={ulRef}>
        <li className="table-header">
          <strong>Entity ID</strong>
          <strong>Provider</strong>
        </li>
        {entitiesData.length ? (
          entitiesData.map(({ entityId, provider }) => {
            return (
              <li key={entityId}>
                {isDynamic ? (
                  <button
                    type="button"
                    onClick={() => showEntityHistory(entityId)}
                  >
                    <span title={entityId}>{entityId}</span>
                    <span title={provider}>{provider}</span>
                  </button>
                ) : (
                  <NavLink
                    to={generateNextRouteUrl(entityId)}
                    onClick={() => anchorClickHandler(entityId)}
                  >
                    <span title={entityId}>{entityId}</span>
                    <span title={provider}>{provider}</span>
                  </NavLink>
                )}
              </li>
            );
          })
        ) : (
          <li className="empty-result-li">
            {!isEnableScroll && (
              <div className="empty-result">
                조회된 Entity가 존재하지 않습니다.
              </div>
            )}
          </li>
        )}
        {isEnableScroll && (
          <div ref={observedRef} className="scroll-loader">
            <img src={LoadingIcon} alt="페이지 추가 랜더링" />
          </div>
        )}
      </ul>
    </div>
  );
}

export default EntityList;
