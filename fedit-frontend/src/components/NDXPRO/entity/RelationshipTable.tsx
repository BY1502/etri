import { useSetActiveEntityTab } from 'components/NDXPRO/hooks/useActiveEntityTab';
import { INIT_ENTITY_SEARCH_INFO } from 'components/NDXPRO/hooks/useEntitySearchInfo';
import { useNavigate, useParams } from 'react-router-dom';
import { EntityTabType, RelationshipInfoType } from 'types/entity';

import InfoContainer from './InfoContainer';

interface IProps {
  currentEntityPath: string[];
  appendEntityTabList: (newParam: EntityTabType) => void;
  relationshipInfoList: RelationshipInfoType[];
  relatoinshipPathList?: string[];
}

function RelationshipInfo({
  currentEntityPath,
  appendEntityTabList,
  relationshipInfoList,
  relatoinshipPathList,
}: IProps) {
  const param = useParams();
  const navigate = useNavigate();
  const setActiveEntityTab = useSetActiveEntityTab();

  const onClickAnchor = async (entityId: string) => {
    const { contextId } = param;
    if (contextId === undefined || setActiveEntityTab === undefined) return;

    const modelId = entityId.split(':')[2];

    navigate(
      `/service-description-tool/entity-management/${encodeURIComponent(contextId)}/${modelId}/${encodeURIComponent(
        entityId,
      )}`,
    );

    const newEntityTab: EntityTabType = {
      title: entityId,
      contextId,
      modelId,
      entityId,
      detailId: entityId,
      searchInfo: INIT_ENTITY_SEARCH_INFO,
    };

    setActiveEntityTab(newEntityTab);
    appendEntityTabList(newEntityTab);
  };

  const generateRelationshipRow = (
    entities: string[],
    relationshipAttribute: string,
  ) => {
    return entities.map((entity, index) => {
      const loopKey = `${entity}-${relationshipAttribute}-${index}`;
      return (
        <tr key={loopKey} className="relation-tab">
          <td>
            <button type="button" onClick={() => onClickAnchor(entity)}>
              {entity}
            </button>
          </td>
          <td>
            <button type="button" onClick={() => onClickAnchor(entity)}>
              {relationshipAttribute}
            </button>
          </td>
        </tr>
      );
    });
  };

  // FIXME: InfoContainer path props 값 변경 historyId => date
  return (
    <InfoContainer
      className="relationship-table-wrapper"
      title="Relationship"
      path={
        relatoinshipPathList !== undefined
          ? relatoinshipPathList
          : currentEntityPath
      }
    >
      <table>
        <thead>
          <tr>
            <th>이름</th>
            <th>Relationship</th>
          </tr>
        </thead>
        <tbody>
          {relationshipInfoList.map(({ entities, relationshipValue }) => {
            return generateRelationshipRow(entities, relationshipValue);
          })}
        </tbody>
      </table>
    </InfoContainer>
  );
}

export default RelationshipInfo;
