import { useTreeToggle } from 'components/NDXPRO/hooks/useTreeToggle';
import React, { Dispatch, SetStateAction } from 'react';
import { TreeItemType } from 'types/entityTree';
import ToggleTabLabel from './ToggleTabLabel';

interface IProps {
  label: string | undefined;
  attributeType: string | undefined;
  treePath: string;
  className?: string | undefined;
  childTreeJson?: TreeItemType[];
  children: React.ReactNode;
}

function TreeItemTemplate({
  label,
  attributeType,
  treePath,
  className,
  childTreeJson,
  children,
}: IProps) {
  const [toggle, setToggle, historyObserverTrigger] = useTreeToggle(
    true,
    treePath,
  ) as [boolean, Dispatch<SetStateAction<boolean>>, FunctionConstructor];

  historyObserverTrigger();

  return (
    <li className={className}>
      <ToggleTabLabel
        toggle={toggle}
        setToggle={setToggle}
        label={label}
        attributeType={attributeType}
        childTreeJson={childTreeJson}
      />
      <div style={{ display: toggle ? 'block' : 'none' }}>{children}</div>
    </li>
  );
}

export default TreeItemTemplate;
