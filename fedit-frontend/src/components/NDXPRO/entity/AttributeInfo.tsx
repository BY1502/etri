import {
  getEntityDetail,
  getIotEntityDetail,
} from 'apis/NDXPRO/dataServiceApi';
import FoldIcon from 'assets/images/fold.svg';
import UnFoldIcon from 'assets/images/unfold.svg';
import { useActiveEntityTab } from 'components/NDXPRO/hooks/useActiveEntityTab';
import { useTreeHistory } from 'components/NDXPRO/hooks/useTreeHistory';
import {
  createContext,
  Dispatch,
  SetStateAction,
  useEffect,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { AttributeTypes } from 'types/common';
import {
  EntityDetailRequestType,
  EntityDetailType,
  RelationshipInfoType,
} from 'types/entity';
import { TreeJsonType } from 'types/entityTree';
import { convertFullDateTimeFromString } from 'utils/date';
import { generateTreeListJson } from 'utils/entityTree';

import InfoContainer from './InfoContainer';
import TreeList from './tree/TreeList';

export const IsFoldAllStateContext = createContext<boolean>(false);

interface IProps {
  currentEntityPath: string[];
  setCurrentEntityPath: Dispatch<SetStateAction<string[]>>;
  setRootRelationshipInfoList: Dispatch<SetStateAction<RelationshipInfoType[]>>;
  removeEntityTabList: (entityDetailId: string) => void;
}

function AttributeInfo({
  currentEntityPath,
  setCurrentEntityPath,
  setRootRelationshipInfoList,
  removeEntityTabList,
}: IProps) {
  const param = useParams();
  const [attributeObj, setAttributeObj] = useState<
    EntityDetailType | undefined
  >(undefined);
  const [observedAt, setObservedAt] = useState<string | null>(null);
  const [jsonForTreeList, setJsonForTreeList] = useState<TreeJsonType>({});
  const [isFoldAll, setIsFoldAll] = useState(false);
  const treeHistory = useTreeHistory();
  const activeEntityTab = useActiveEntityTab();

  const setAttributeForDynamicEntity = async () => {
    const { historyId, entityId } = param;
    const { observedTimeInfo } = activeEntityTab.searchInfo;
    try {
      if (observedTimeInfo && historyId) {
        const config = {
          params: {
            timeproperty: `${observedTimeInfo.property}.observedAt`,
          },
        };

        const data = await getIotEntityDetail(historyId, config);
        setObservedAt(data.observedAt);
        setAttributeObj({ provider: data.provider, entity: data.entity });
      } else {
        setAttributeObj(undefined);
      }
    } catch (err) {
      alert(`Entity 조회에 실패하였습니다. \n- entity id: ${entityId}`);
      if (entityId) removeEntityTabList(entityId);
      console.log(err);
    }
  };

  const setAttributeForStaticEntity = async () => {
    const { entityId, contextId } = param;
    try {
      if (entityId) {
        const config: EntityDetailRequestType = {
          headers: {
            Link: `<${contextId}>`,
          },
        };
        const data = await getEntityDetail(entityId, config);
        setAttributeObj(data);
      } else {
        setAttributeObj(undefined);
      }
    } catch (err) {
      alert(`Entity 조회에 실패하였습니다. \n- entity id: ${entityId}`);
      if (entityId) removeEntityTabList(entityId);
      console.log(err);
    }
  };

  useEffect(() => {
    const { historyId } = param;
    if (historyId) {
      setAttributeForDynamicEntity();
    } else {
      setAttributeForStaticEntity();
    }
  }, [param.entityId, param.historyId]);

  useEffect(() => {
    if (attributeObj) {
      const entitiesData = attributeObj;
      const currentEntityPath = [entitiesData.entity.id];

      if (observedAt !== null) {
        currentEntityPath.push(convertFullDateTimeFromString(observedAt));
      }
      setCurrentEntityPath(currentEntityPath);
      setJsonForTreeList(generateTreeListJson(entitiesData.entity));

      const rootRelationshipInfoList: RelationshipInfoType[] = [];
      Object.entries(entitiesData.entity)
        .splice(3)
        .forEach(([key, value]: [string, any]) => {
          if (value.type === AttributeTypes.Relationship) {
            const relationshipInfo = {
              entities: value.object,
              relationshipValue: key,
            };
            rootRelationshipInfoList.push(relationshipInfo);
          }
        });

      setRootRelationshipInfoList(rootRelationshipInfoList);
    }
  }, [attributeObj]);

  const foldAllHandler = (toggle: boolean) => {
    const detailId = param['*']?.split('/').at(-1);

    const currentTreeHistory = treeHistory.find(
      (el) => el.treeHistoryId === detailId,
    );

    if (currentTreeHistory !== undefined) {
      const keys = Object.keys(currentTreeHistory.treeHistory);
      keys.forEach((key) => {
        currentTreeHistory.treeHistory[key] = toggle;
      });
    }
    setIsFoldAll((prev) => !prev);
  };

  return (
    <InfoContainer
      className="attribute-info-wrapper"
      title="Attribute 정보"
      path={currentEntityPath}
    >
      <div className="attribute-info">
        <div className="btn-wrapper">
          <button type="button" onClick={() => foldAllHandler(true)}>
            <img src={UnFoldIcon} alt="전체 펼치기" />
          </button>
          <button type="button" onClick={() => foldAllHandler(false)}>
            <img src={FoldIcon} alt="전체 접기" />
          </button>
        </div>
        <ul className="tree-list">
          <IsFoldAllStateContext.Provider value={isFoldAll}>
            {jsonForTreeList[0] !== undefined && (
              <TreeList
                treeJson={jsonForTreeList}
                depth={0}
                parent="root"
                treePath="root"
              />
            )}
          </IsFoldAllStateContext.Provider>
        </ul>
      </div>
    </InfoContainer>
  );
}

export default AttributeInfo;
