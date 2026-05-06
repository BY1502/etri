import { Dispatch, SetStateAction, useState } from 'react';

import { TranslatorType } from 'types/translator';
import TranslatorDetail from './TranslatorDetail';
import TranslatorHeader from './TranslatorHeader';

interface IProps {
  tabId: number;
  isActive: boolean;
  setActiveTabId: Dispatch<SetStateAction<null | number>>;
  translator: TranslatorType;
}

function TranslatorItem({
  tabId,
  isActive,
  setActiveTabId,
  translator,
}: IProps) {
  const [isEdit, setIsEdit] = useState(false);

  const onChangeTabToggle = () => {
    setActiveTabId((prev) => {
      if (prev !== tabId) {
        return tabId;
      }

      if (prev === null) {
        return tabId;
      }

      return null;
    });
  };

  const onChangeIsEdit = () => {
    setIsEdit(!isEdit);
  };

  return (
    <li className="translator-item-wrapper">
      <TranslatorHeader
        translator={translator}
        isEdit={isEdit}
        isActive={isActive}
        onChangeTabToggle={onChangeTabToggle}
      />
      {isActive && (
        <div className="container">
          <aside>
            <button type="button" className="active">
              Details
            </button>
            <button type="button">Logs</button>
          </aside>
          <TranslatorDetail
            translator={translator}
            isEdit={isEdit}
            onChangeIsEdit={onChangeIsEdit}
          />
        </div>
      )}
    </li>
  );
}

export default TranslatorItem;
