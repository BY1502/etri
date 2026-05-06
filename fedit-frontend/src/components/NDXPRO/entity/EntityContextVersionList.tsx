import arrowRight from 'assets/images/arrow_right.svg';

import { useEffect, useState } from 'react';

import { getContextVersion } from 'apis/NDXPRO/contextApi';
import { useEntityRouteInfoAction } from 'components/NDXPRO/hooks/useEntityRouteInfo';
import { ContextVersionResponse, ContextVersionType } from 'types/context';
import EntityDataModelList from './EntityDataModelList';

interface IProps {
  contextId: string;
}

function EntityContextVersionList({ contextId }: IProps) {
  const [contextVersionInfoList, setContextVersionInfoList] =
    useState<ContextVersionResponse>([]);
  const routeInfoAction = useEntityRouteInfoAction();

  useEffect(() => {
    getContextVersion({ params: { contextUrl: contextId } }).then(
      (response) => {
        setContextVersionInfoList(response);
        routeInfoAction.setContextId(response[0].url);
      },
    );
  }, []);

  return (
    <ul>
      {contextVersionInfoList.map((contextVersionInfo, idx) => {
        return (
          <EntityContextVersionListItem
            key={contextVersionInfo.url}
            contextVersionInfo={contextVersionInfo}
            idx={idx}
          />
        );
      })}
    </ul>
  );
}

export default EntityContextVersionList;

interface IProps2 {
  contextVersionInfo: ContextVersionType;
  idx: number;
}

function EntityContextVersionListItem({ contextVersionInfo, idx }: IProps2) {
  const [toggle, setToggle] = useState(idx === 0);

  const onClickContext = () => {
    setToggle(!toggle);
  };

  return (
    <li className="entity-context-version-list-wrapper">
      <button
        type="button"
        onClick={onClickContext}
        className="accordion-item-btn"
      >
        <i />
        <img
          src={arrowRight}
          alt=""
          style={{ transform: toggle ? 'rotate(90deg)' : 'rotate(0)' }}
        />
        <p>{contextVersionInfo.version}</p>
      </button>
      {toggle && <EntityDataModelList contextId={contextVersionInfo.url} />}
    </li>
  );
}
