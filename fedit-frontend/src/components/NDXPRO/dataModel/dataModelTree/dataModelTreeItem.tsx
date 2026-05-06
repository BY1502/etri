import { ReactComponent as AddBtn } from 'assets/images/add.svg';
import { ReactComponent as RemoveBtn } from 'assets/images/close.svg';
import Label from 'components/NDXPRO/common/label';
import { SetterOrUpdater } from 'recoil';
import {
  IDataModelAttribute,
  IDataModelAttributeFormat,
} from 'types/dataModelTypes';

function DataModelTreeItem({
  id,
  value,
  owner,
  toggle,
  open,
  setAttributes,
  modelSelected,
  setModelSelected,
  type = 'childAttributes',
}: {
  id: string;
  value: IDataModelAttribute;
  owner?: string;
  toggle: boolean;
  open?: () => void;
  setAttributes: SetterOrUpdater<IDataModelAttributeFormat[]>;
  modelSelected: any;
  setModelSelected: any;
  type?: 'childAttributes' | 'objectMember';
}) {
  const isActive = () => {
    const [selectedOwner, selectedId] = modelSelected;
    if (selectedOwner === owner && selectedId === id) {
      return true;
    }
    return false;
  };

  const toggleHandle = () => {
    setAttributes((prev) => {
      const t: any[] = structuredClone(prev);
      const toggleValue = t.find((e) => e.id === id).toggle;
      t.find((e) => e.id === id).toggle = !toggleValue;
      return t;
    });
  };

  const removeAttribute = (id: string, owner: string | undefined) => {
    if (!window.confirm(`Remove ${id}?`)) {
      return;
    }

    if (!owner) {
      setAttributes((prev) => {
        const newAttribute: any[] = structuredClone(prev).filter(
          (e) => e.id !== id,
        );
        return newAttribute;
      });
    }
    if (owner) {
      setAttributes((prev) => {
        const newAttribute: any[] = structuredClone(prev);
        const ownerValue = newAttribute.find((e) => e.id === owner).value;

        const newChild = ownerValue[type].filter((c: any) => c.id !== id);
        ownerValue[type] = newChild;

        if (ownerValue[type].length === 0) {
          delete ownerValue[type];
        }

        return newAttribute;
      });
    }
    setModelSelected([]);
  };

  const renderIcon = value[type] ? (
    <button
      className={`tree-item-icon ${toggle ? 'fold' : 'unfold'}`}
      type="button"
      onClick={toggleHandle}
    />
  ) : (
    <span className="tree-item-icon" />
  );

  const renderLabel = (
    <>
      {type === 'childAttributes' && value.type && <Label type={value.type} />}
      {type === 'objectMember' && value.valueType && (
        <Label type={value.valueType} />
      )}
    </>
  );

  const renderTreeItemController = (
    <div className="tree-item-controller">
      {((type === 'childAttributes' && !owner) ||
        (type === 'objectMember' &&
          value.valueType === 'Object' &&
          !owner)) && (
        <button type="button" onClick={open}>
          <AddBtn />
        </button>
      )}
      <button type="button" onClick={() => removeAttribute(id, owner)}>
        <RemoveBtn />
      </button>
    </div>
  );

  return (
    <div className="new-data-model-tree-item">
      <div className={`tree-item-summary ${isActive() ? 'active' : ''}`}>
        {owner && <span className="tree-item-line" /> /* line */}
        {renderIcon}
        <button
          className="tree-item-text"
          type="button"
          onClick={() => setModelSelected([owner, id])}
        >
          {id}
          {renderLabel}
        </button>
        {renderTreeItemController}
      </div>
      {toggle &&
        value[type]?.map((e: IDataModelAttributeFormat) => (
          <DataModelTreeItem
            key={e.id}
            id={e.id}
            value={e.value}
            owner={id}
            toggle={e.toggle}
            modelSelected={modelSelected}
            setModelSelected={setModelSelected}
            setAttributes={setAttributes}
            type={type}
          />
        ))}
    </div>
  );
}

export default DataModelTreeItem;
