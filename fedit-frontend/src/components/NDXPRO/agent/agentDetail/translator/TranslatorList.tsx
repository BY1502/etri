import { useState } from 'react';

import { TranslatorType } from 'types/translator';
import TranslatorItem from './TranslatorItem';

interface IProps {
  translators: TranslatorType[];
}

function TranslatorList({ translators }: IProps) {
  const [activeTabId, setActiveTabId] = useState<null | number>(0);

  return (
    <ul className="translator-list-wrapper">
      {translators.map((translator, idx) => {
        return (
          <TranslatorItem
            key={translator.id}
            tabId={idx}
            isActive={activeTabId === idx}
            setActiveTabId={setActiveTabId}
            translator={translator}
          />
        );
      })}
    </ul>
  );
}

export default TranslatorList;
