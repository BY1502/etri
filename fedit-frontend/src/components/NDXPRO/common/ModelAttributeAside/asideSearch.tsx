import { ReactNode, useState } from 'react';

import { ReactComponent as ArrowDownIcon } from 'assets/images/arrow_down.svg';
import { ReactComponent as SearchIcon } from 'assets/images/search.svg';

import InputContainer from 'components/NDXPRO/common/inputContainer';

function AsideSearch({
  content,
  onClick,
  children,
}: {
  content?: ReactNode;
  onClick?: () => void;
  children: ReactNode;
}) {
  const [toggle, setToggle] = useState(false);
  return (
    <div className="aside-search">
      <div className="aside-search-header">
        <InputContainer contentNode={content} />
        <button
          type="button"
          className={toggle ? 'reverse' : ''}
          onClick={() => setToggle(!toggle)}
        >
          <ArrowDownIcon />
        </button>
        <button type="button" onClick={onClick}>
          <SearchIcon />
        </button>
      </div>
      <div className={`aside-search-detail ${toggle ? '' : 'off'}`}>
        {children}
      </div>
    </div>
  );
}

export default AsideSearch;
