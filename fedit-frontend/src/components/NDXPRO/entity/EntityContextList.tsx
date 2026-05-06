import arrowRight from 'assets/images/arrow_right.svg';

import { getContextData } from 'apis/NDXPRO/contextApi';
import { useEffect, useState } from 'react';

import EntityContextVersionList from './EntityContextVersionList';

function EntityContextList() {
  const [contextList, setContextList] = useState<string[]>([]);

  useEffect(() => {
    getContextData().then((res: string[]) => {
      const filteredContextList = res.filter((el) => !el.includes('ngsi-ld'));
      setContextList(filteredContextList);
    });
  }, []);

  return (
    <ul className="entity-context-list">
      {contextList.map((contextData, idx) => {
        return (
          <ContextListItem
            key={contextData}
            contextData={contextData}
            idx={idx}
          />
        );
      })}
    </ul>
  );
}

interface IProps2 {
  contextData: string;
  idx: number;
}

function ContextListItem({ contextData, idx }: IProps2) {
  // TODO: needs to go back to the first of list, changed to 2 for ETRI demonstratino purpose JUL 2n, 2024
  const [toggle, setToggle] = useState(idx === 3);

  const onClickContext = () => {
    setToggle(!toggle);
  };

  return (
    <li className="entity-context-list-wrapper">
      <button
        type="button"
        onClick={onClickContext}
        className="accordion-item-btn"
      >
        <img
          src={arrowRight}
          alt=""
          style={{ transform: toggle ? 'rotate(90deg)' : 'rotate(0)' }}
        />
        <p>{contextData}</p>
      </button>
      {toggle && <EntityContextVersionList contextId={contextData} />}
    </li>
  );
}

export default EntityContextList;
