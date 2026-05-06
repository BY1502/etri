import { useEntityRouteInfoAction } from 'components/NDXPRO/hooks/useEntityRouteInfo';
import {
  useInfoListValue,
  usePathListValue,
} from 'components/NDXPRO/hooks/useRelationshipInfo';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EntityTabType, RelationshipInfoType } from 'types/entity';

import AttributeInfo from './AttributeInfo';
import EntityInfoTable from './EntityInfoTable';
import EntityTabList from './EntityTabList';
import RelationshipTable from './RelationshipTable';

interface IProps {
  entityTabList: EntityTabType[];
  appendEntityTabList: (newEntityTab: EntityTabType) => void;
  removeEntityTabList: (entityDetailId: string) => void;
}

function EntityDetail({
  entityTabList,
  appendEntityTabList,
  removeEntityTabList,
}: IProps) {
  const [rootRelationshipInfoList, setRootRelationshipInfoList] = useState<
    RelationshipInfoType[]
  >([]);
  const childRelationshipInfoList = useInfoListValue();
  const childRelationshipPathList = usePathListValue();
  const [currentEntityPath, setCurrentEntityPath] = useState<string[]>([]);
  const param = useParams();

  const routeInfoAction = useEntityRouteInfoAction();

  useEffect(() => {
    const { contextId, modelId, entityId, historyId } = param;

    routeInfoAction.set({
      contextId,
      modelId,
      entityId,
      historyId,
    });
  }, [param.contextId, param.modelId, param.entityId, param.historyId]);

  return (
    <div className="entity-detail">
      <EntityTabList
        entityTabList={entityTabList}
        removeEntityTabList={removeEntityTabList}
      />
      <section>
        <article>
          <AttributeInfo
            currentEntityPath={currentEntityPath}
            setCurrentEntityPath={setCurrentEntityPath}
            setRootRelationshipInfoList={setRootRelationshipInfoList}
            removeEntityTabList={removeEntityTabList}
          />
        </article>
        <article>
          <EntityInfoTable />
          <RelationshipTable
            currentEntityPath={currentEntityPath}
            appendEntityTabList={appendEntityTabList}
            relationshipInfoList={rootRelationshipInfoList}
          />
          {/* FIXME: childRelationshipPathList 값 수정 필요 param에는 detailId가 없음 */}
          {childRelationshipInfoList.length !== 0 &&
            param.detailId === childRelationshipPathList[0] && (
              <RelationshipTable
                currentEntityPath={currentEntityPath}
                appendEntityTabList={appendEntityTabList}
                relationshipInfoList={childRelationshipInfoList}
                relatoinshipPathList={childRelationshipPathList}
              />
            )}
        </article>
      </section>
    </div>
  );
}

export default EntityDetail;
