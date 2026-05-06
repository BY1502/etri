import { useState } from 'react';

import ItemSVG from 'assets/images/entity.svg';
import { AttributeTypes } from 'types/common';
import ToggleButton from './ToggleButton';
import TreeItemTemplate from './TreeItemTemplate';

interface ItemValueForArrayObjectProps {
  index: number;
  object: object;
}

function ItemValueForArrayObject({
  index,
  object,
}: ItemValueForArrayObjectProps) {
  const [toggle, setToggle] = useState(true);
  return (
    <li>
      <div className="toggle-tab-label">
        <ToggleButton toggle={toggle} setToggle={setToggle} />
        <span className="array-index">{index}</span>
      </div>
      {toggle && <ItemValueForObject entries={Object.entries(object)} />}
    </li>
  );
}

interface ItemValueForArrayProps {
  array: any[];
}

export function ItemValueForArray({ array }: ItemValueForArrayProps) {
  const generateValueDom = (value: any) => {
    if (value.constructor === Object) {
      return <ItemValueForObject entries={Object.entries(value)} />;
    }

    return <strong>{value}</strong>;
  };

  return (
    <ul className="depth-division">
      {array.map((value, index) => {
        const loopKey = `${index}-${value}`;

        if (value.constructor === Object) {
          return (
            <ItemValueForArrayObject
              key={loopKey}
              index={index}
              object={value}
            />
          );
        }
        return (
          <li key={loopKey} className="item-tab-label">
            <img src={ItemSVG} alt="아이템 아이콘" />
            <span>{index}: </span>
            {generateValueDom(value)}
          </li>
        );
      })}
    </ul>
  );
}

interface ItemValueForObjectProps {
  entries: any[];
}

function ItemValueForObject({ entries }: ItemValueForObjectProps) {
  return (
    <ul className="depth-division">
      {entries.map(([key, value]: [string, any], index) => {
        const loopKey = `${index}-${value}`;
        return (
          <li key={loopKey} className="item-tab-label">
            <img src={ItemSVG} alt="아이템 아이콘" />
            <span>{key}: </span>
            <strong>{value}</strong>
          </li>
        );
      })}
    </ul>
  );
}

interface IProps {
  value: any;
  treePath: string;
}

function ItemValueForReference({ treePath, value }: IProps) {
  const currentPath = `${treePath}/value`;

  const renderComponent =
    value.constructor === Object ? (
      <ItemValueForObject entries={Object.entries(value)} />
    ) : (
      <ItemValueForArray array={value} />
    );

  return (
    <TreeItemTemplate
      className="depth-division"
      label="value"
      attributeType={AttributeTypes.None}
      treePath={currentPath}
    >
      {renderComponent}
    </TreeItemTemplate>
  );
}

export default ItemValueForReference;
