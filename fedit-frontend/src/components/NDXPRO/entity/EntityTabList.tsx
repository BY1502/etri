import CloseBtn from 'assets/images/close.svg';
import { useSetActiveEntityTab } from 'components/NDXPRO/hooks/useActiveEntityTab';

import { NavLink } from 'react-router-dom';
import { EntityTabType } from 'types/entity';

interface IProps2 {
  tabWidth: number;
  entityTabInfo: EntityTabType;
  removeEntityTabList: (entityDetailId: string) => void;
}

function EntityTabItem({
  tabWidth,
  entityTabInfo,
  removeEntityTabList,
}: IProps2) {
  const setActiveEntityTab = useSetActiveEntityTab();
  const { title, contextId, modelId, entityId, historyId, detailId, subTitle } =
    entityTabInfo;

  const routeURL = entityTabInfo.historyId
    ? `/service-description-tool/entity-management/${encodeURIComponent(
        contextId,
      )}/${modelId}/${encodeURIComponent(entityId)}/${historyId}`
    : `/service-description-tool/entity-management/${encodeURIComponent(
        contextId,
      )}/${modelId}/${encodeURIComponent(entityId)}`;

  const anchorClickHandler = () => {
    if (setActiveEntityTab === undefined) return;

    setActiveEntityTab(entityTabInfo);
  };

  return (
    <li className="tab-item-wrapper" style={{ width: `${tabWidth}%` }}>
      <NavLink to={routeURL} onClick={anchorClickHandler}>
        <strong title={title}>{title}</strong>
        {subTitle && <span title={subTitle}>{subTitle}</span>}
      </NavLink>
      <button type="button" onClick={() => removeEntityTabList(detailId)}>
        <img src={CloseBtn} alt="탭 닫기 버튼" />
      </button>
    </li>
  );
}

interface IProps1 {
  entityTabList: EntityTabType[];
  removeEntityTabList: (entityDetailId: string) => void;
}

function EntityTabList({ entityTabList, removeEntityTabList }: IProps1) {
  const tabWidth = 100 / entityTabList.length;

  return (
    <ul className="tab-list-wrapper">
      {entityTabList.map((entityTabInfo) => {
        return (
          <EntityTabItem
            key={entityTabInfo.detailId}
            tabWidth={tabWidth}
            entityTabInfo={entityTabInfo}
            removeEntityTabList={removeEntityTabList}
          />
        );
      })}
    </ul>
  );
}

export default EntityTabList;
