import arrowRightIcon from 'assets/images/arrow_right.svg';
import LoadingIcon from 'assets/images/refresh.svg';

import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { getIotEntityHistory } from 'apis/NDXPRO/dataServiceApi';
import {
  useActiveEntityTab,
  useSetActiveEntityTab,
} from 'components/NDXPRO/hooks/useActiveEntityTab';
import useDidMountEffect from 'components/NDXPRO/hooks/useDidMountEffect';
import { useEntityRouteInfo } from 'components/NDXPRO/hooks/useEntityRouteInfo';
import useScrollObserver from 'components/NDXPRO/hooks/useScrollObserver';
import {
  CriteriaInfoTypeList,
  EntityHistoryDto,
  EntityHistoryRequestParamsType,
  EntityHistoryRequestType,
  EntityRequestHeaderType,
  EntitySearchInfoAction,
  EntitySearchInfoType,
  EntityTabType,
  ModelInfoReturnTypeForEntity,
  ValueType,
} from 'types/entity';
import { ErrorResponseType } from 'types/error';
import { convertFullDateTimeFromString } from 'utils/date';
import { qQueryGenerator } from 'utils/generator';
import EntitySearchForm from './searchForm/EntitySearchForm';

interface IProps {
  targetEntityId: string;
  searchInfo: EntitySearchInfoType;
  searchInfoAction: EntitySearchInfoAction;
  getModelInfo: (isHistory: boolean) => Promise<ModelInfoReturnTypeForEntity>;
  showEntityList: () => void;
  appendEntityTabList: (newEntityTab: EntityTabType) => void;
}

function EntityHistory({
  targetEntityId,
  searchInfo,
  searchInfoAction,
  getModelInfo,
  showEntityList,
  appendEntityTabList,
}: IProps) {
  const [entitiesHistoryData, setEntitiesHistoryData] = useState<
    EntityHistoryDto[]
  >([]);

  const {
    observedRef,
    isLoading: isScrollLoading,
    observerController,
  } = useScrollObserver();
  const [isEnableScroll, setIsEnableScroll] = useState(true);
  const ulRef = useRef<HTMLUListElement>(null);
  const [pageLimit, setPageLimit] = useState(0);
  const [pageCnt, setPageCnt] = useState(0);

  const [timePropertyList, setTimePropertyList] = useState<string[]>([]);
  const [searchCriteriaInfoList, setSearchCriteriaInfoList] =
    useState<CriteriaInfoTypeList>([]);

  const routeInfo = useEntityRouteInfo();
  const setActiveEntityTab = useSetActiveEntityTab();

  const updateEntitiesHistoryData = async (
    config: EntityHistoryRequestType,
    isInit: boolean,
  ) => {
    try {
      const data = await getIotEntityHistory(config);

      setEntitiesHistoryData((prev) => {
        return isInit
          ? data.entityHistoryList
          : [...prev, ...data.entityHistoryList];
      });

      if (
        data.entityHistoryList.length === 0 ||
        pageLimit > data.entityHistoryList.length
      ) {
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

  const generateRequestConfig = (pageCnt: number): EntityHistoryRequestType => {
    const { observedTimeInfo, criteriaInfo1 } = searchInfo;

    const headers: EntityRequestHeaderType = {
      Link: `<${routeInfo.contextId}>`,
    };
    const params: EntityHistoryRequestParamsType = {
      entityId: targetEntityId,
      offset: pageCnt,
      limit: pageLimit,
      timeproperty: `${observedTimeInfo?.property}.observedAt`,
      sortproperty: `${observedTimeInfo?.property}.observedAt`,
    };

    try {
      const excludeList = ['_id.id', '_id.servicePath'];

      const qQuery =
        qQueryGenerator(
          criteriaInfo1?.criteria,
          criteriaInfo1?.valueType,
          criteriaInfo1?.value,
          excludeList,
        ) +
        qQueryGenerator(
          observedTimeInfo?.property,
          observedTimeInfo?.valueType,
          observedTimeInfo?.value,
          excludeList,
        );

      if (qQuery) {
        params.q = qQuery;
      }

      if (observedTimeInfo) {
        if (observedTimeInfo.startTime) {
          params.time = `${observedTimeInfo.startTime}:00.0`;
        }

        if (observedTimeInfo.startTime && observedTimeInfo.endTime) {
          params.endTime = `${observedTimeInfo.endTime}:00.0`;
        } else if (observedTimeInfo.endTime) {
          params.time = `${observedTimeInfo.endTime}:00.0`;
        }

        if (observedTimeInfo.timerel) {
          params.timerel = observedTimeInfo.timerel;
        }
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
    const response = await getModelInfo(true);
    if (ulRef.current === null || response === undefined) return;

    ulRef.current.scroll({ top: 0 });
    const pageLimit = Math.round(ulRef.current.offsetHeight / 28) + 3;

    const dynamicSearchCriteriaInfoList =
      response.searchCriteriaInfoList.filter(
        (searchCriteriaInfo) =>
          response.timePropertyList.includes(searchCriteriaInfo.criteria) ||
          searchCriteriaInfo.criteria.includes('.observedAt'),
      );

    if (activeTab.modelId === response.modelId && searchInfo.observedTimeInfo) {
      searchInfoAction.set(activeTab.searchInfo);
    } else {
      const property = response.timePropertyList[0];
      const valueType = response.searchCriteriaInfoList.find(
        (searchCriteriaInfo) =>
          searchCriteriaInfo.criteria === response.timePropertyList[0],
      )?.valueType as ValueType;
      searchInfoAction.resetForDynamic(property, valueType);
    }

    setTimePropertyList(response.timePropertyList);
    setSearchCriteriaInfoList(dynamicSearchCriteriaInfoList);
    setPageLimit(pageLimit);
    setEntitiesHistoryData([]);
    setPageCnt(0);
    setIsEnableScroll(true);
  };

  // init
  useEffect(() => {
    (async () => {
      await initStaties();
    })();
  }, [targetEntityId, routeInfo.historyId]);

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

      updateEntitiesHistoryData(config, isInit);
      setPageCnt((prev) => prev + 1);
    }
  }, [isScrollLoading, pageLimit]);

  // search logic
  useDidMountEffect(() => {
    if (pageLimit !== 0 && searchInfo.observedTimeInfo?.property) {
      setEntitiesHistoryData([]);
      updateEntitiesHistoryData(generateRequestConfig(0), true);
      setPageCnt(1);
      setIsEnableScroll(true);
    }
  }, [searchInfo]);

  const anchorClickHandler = (entityHistoryData: EntityHistoryDto) => {
    const { contextId, modelId } = routeInfo;
    if (
      contextId === undefined ||
      modelId === undefined ||
      setActiveEntityTab === undefined
    )
      return;

    const newEntityTabInfo: EntityTabType = {
      title: entityHistoryData.entityId,
      subTitle: `${
        searchInfo.observedTimeInfo?.property || timePropertyList[0]
      } ${convertFullDateTimeFromString(entityHistoryData.observedAt)}`,
      contextId,
      modelId,
      entityId: entityHistoryData.entityId,
      historyId: entityHistoryData.historyId,
      detailId: entityHistoryData.historyId,
      searchInfo,
    };

    setActiveEntityTab(newEntityTabInfo);
    appendEntityTabList(newEntityTabInfo);
  };

  const generateNextRouteUrl = (data: EntityHistoryDto) => {
    const contextIdRoute = encodeURIComponent(routeInfo.contextId as string);
    const modelIdRoute = routeInfo.modelId;
    const entityIdRoute = encodeURIComponent(data.entityId);
    const historyIdRoute = data.historyId;
    return `${contextIdRoute}/${modelIdRoute}/${entityIdRoute}/${historyIdRoute}`;
  };

  return (
    <div className="entity-list">
      <div className="header-wrapper">
        <h3 className="history-path">
          <button
            type="button"
            className="title-path-btn"
            onClick={showEntityList}
          >
            {routeInfo.modelId}
            <img src={arrowRightIcon} alt="이전 모델로 이동" />
          </button>
          <span title={targetEntityId}>{targetEntityId}</span>
        </h3>
      </div>
      <EntitySearchForm
        searchInfo={searchInfo}
        searchInfoAction={searchInfoAction}
        timePropertyList={timePropertyList}
        searchCriteriaInfoList={searchCriteriaInfoList}
        isDynamic
      />
      <ul ref={ulRef}>
        {/* TODO: Loading component 만들기 */}
        <li className="table-header">
          <strong>Observed Time</strong>
          <strong>Provider</strong>
        </li>
        {entitiesHistoryData.length ? (
          entitiesHistoryData.map((data) => {
            return (
              <li key={data.historyId}>
                <NavLink
                  to={generateNextRouteUrl(data)}
                  onClick={() => anchorClickHandler(data)}
                >
                  <span title={convertFullDateTimeFromString(data.observedAt)}>
                    {convertFullDateTimeFromString(data.observedAt)}
                  </span>
                  <span title={data.provider}>{data.provider}</span>
                </NavLink>
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

export default EntityHistory;
