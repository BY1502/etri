import searchMoreIconOn from 'assets/images/arrow_down.svg';
import searchMoreIconOff from 'assets/images/arrow_up.svg';
import searchIcon from 'assets/images/search.svg';

import { useState } from 'react';

function AgentSearch() {
  const [searchToggle, setSearchToggle] = useState(false);
  const [wordText, setWordText] = useState('');

  const handleSubmit = () => {
    // submitSearchForm(newSearchOption);
  };

  const handleKeyPress = (e: any) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="model-attr-search">
      <div className={searchToggle ? 'search-form show' : 'search-form'}>
        <fieldset className="input-wrapper search-input">
          <input
            className=""
            placeholder="검색어를 입력하세요"
            value={wordText}
            onChange={(e) => setWordText(e.target.value)}
            onKeyDown={handleKeyPress}
          />
          <button type="button" onClick={() => console.log('test')}>
            <img src={searchIcon} alt="검색" />
          </button>
          <button
            type="button"
            className="more-button"
            onClick={() => setSearchToggle(!searchToggle)}
          >
            <img
              src={searchToggle ? searchMoreIconOff : searchMoreIconOn}
              alt="상세 검색"
            />
          </button>
        </fieldset>
      </div>
    </div>
  );
}

export default AgentSearch;
