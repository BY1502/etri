import {
  useSetInfoListValue,
  useSetPathListValue,
} from 'components/NDXPRO/hooks/useRelationshipInfo';
import { Dispatch, SetStateAction, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { AttributeTypes } from 'types/common';
import { RelationshipInfoType } from 'types/entity';
import { TreeItemType } from 'types/entityTree';
import ToggleButton from './ToggleButton';

interface IProps {
  toggle: boolean;
  setToggle: Dispatch<SetStateAction<boolean>>;
  label: string | undefined;
  attributeType: string | undefined;
  childTreeJson?: TreeItemType[];
}

function ToggleTabLabel({
  toggle,
  setToggle,
  label,
  attributeType,
  childTreeJson,
}: IProps) {
  let backgroundColor;
  switch (attributeType) {
    case AttributeTypes.Property:
      backgroundColor = 'var(--blue)';
      break;
    case AttributeTypes.Relationship:
      backgroundColor = 'var(--yellow)';
      break;
    case AttributeTypes.GeoProperty:
      backgroundColor = 'var(--green)';
      break;
    default:
      backgroundColor = 'var(--sky)';
  }

  const param = useParams();
  const setChildRelationshipInfoList = useSetInfoListValue() as Dispatch<
    SetStateAction<RelationshipInfoType[]>
  >;
  const setChildRelationshipPathList = useSetPathListValue() as Dispatch<
    SetStateAction<string[]>
  >;

  const rowRef = useRef<HTMLDivElement>(null);
  const onMouseEnter = () => {
    rowRef.current?.classList.add('hover');
  };

  const onMouseLeave = () => {
    rowRef.current?.classList.remove('hover');
  };

  const updateRelationshipInfoList = () => {
    const targetRelationshipDatas = childTreeJson?.filter(
      (el) => el.parent === label && el.type === AttributeTypes.Relationship,
    );

    const relationshipInfoList: RelationshipInfoType[] = [];
    targetRelationshipDatas?.forEach((relationshipInfo) => {
      relationshipInfoList.push({
        entities: relationshipInfo.children.object,
        relationshipValue: relationshipInfo.target,
      });
    });
    setChildRelationshipInfoList(relationshipInfoList);
  };

  // FIXME: 자식 관련 relationship table 로직 수정 필요
  const updateRelationshipPathList = () => {
    const currentEntity = param.detailId; // entity id or history id (여기서는 entity id)
    if (currentEntity !== undefined && label !== undefined) {
      setChildRelationshipPathList([currentEntity, label]);
    }
  };

  const onSelectedLabel = () => {
    document
      .querySelectorAll('.whole-row')
      .forEach((el) => el.classList.remove('selected'));
    rowRef.current?.classList.add('selected');

    updateRelationshipInfoList();
    updateRelationshipPathList();
  };

  const renderComponent =
    attributeType === AttributeTypes.None ? (
      <strong>{label}</strong>
    ) : (
      <>
        <button type="button" onClick={onSelectedLabel}>
          {label}
        </button>
        <span style={{ backgroundColor }}>{attributeType}</span>
      </>
    );

  return (
    <div
      className="toggle-tab-label"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="whole-row" ref={rowRef} />
      <ToggleButton toggle={toggle} setToggle={setToggle} />
      {renderComponent}
    </div>
  );
}

export default ToggleTabLabel;
