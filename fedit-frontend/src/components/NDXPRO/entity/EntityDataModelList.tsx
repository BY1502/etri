import DataModelImg from 'assets/images/data_model.svg';

import { getContextInfoData } from 'apis/NDXPRO/contextApi';
import {
  useEntityRouteInfo,
  useEntityRouteInfoAction,
} from 'components/NDXPRO/hooks/useEntityRouteInfo';
import React, { useEffect, useRef, useState } from 'react';

interface DataModelType {
  [key: string]: string;
}
interface IProps1 {
  contextId: string;
}

function EntityDataModelList({ contextId }: IProps1) {
  const [dataModelList, setDataModelList] = useState<string[]>([]);
  const dataModelListRef = useRef<HTMLUListElement>(null);
  const routeInfoAction = useEntityRouteInfoAction();

  useEffect(() => {
    getContextInfoData({ contextUrl: contextId })
      .then((res: DataModelType) => {
        const dataModelList = Object.keys(res).filter((dataModel) =>
          dataModel[0].match(/[A-Z]/),
        );
        setDataModelList(dataModelList);
        // TODO: needs to go back to the first of list, changed to 2 for ETRI demonstratino purpose JUL 2n, 2024
        routeInfoAction.setModelId(dataModelList[1]);
      })
      .catch((error) => {
        alert('서버에 문제가 생겼습니다. 개발팀에 문의주세요.');
        console.log(error);
      });
  }, []);
  return (
    <ul ref={dataModelListRef}>
      {dataModelList.map((dataModel) => {
        return (
          <DataModelListItem
            key={dataModel}
            contextId={contextId}
            dataModel={dataModel}
          />
        );
      })}
    </ul>
  );
}

interface IProps2 {
  contextId: string;
  dataModel: string;
}

function DataModelListItem({ contextId, dataModel }: IProps2) {
  const routeInfo = useEntityRouteInfo();
  const routeInfoAction = useEntityRouteInfoAction();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (routeInfo.contextId === contextId && routeInfo.modelId === dataModel) {
      document
        .querySelectorAll('.data-model-btn')
        .forEach((el) => el.classList.remove('active'));
      buttonRef.current?.classList.add('active');
    }
  }, [routeInfo]);

  const onClickDataModel = (event: React.MouseEvent) => {
    document
      .querySelectorAll('.data-model-btn')
      .forEach((el) => el.classList.remove('active'));

    event.currentTarget.classList.add('active');
    routeInfoAction.set({
      contextId,
      modelId: dataModel,
    });
  };

  return (
    <li key={dataModel} className="entity-data-model-list-wrapper">
      <button
        type="button"
        onClick={onClickDataModel}
        className="data-model-btn"
        ref={buttonRef}
      >
        <i />
        <i />
        <img src={DataModelImg} alt="" />
        <span>{dataModel}</span>
      </button>
    </li>
  );
}

export default EntityDataModelList;
