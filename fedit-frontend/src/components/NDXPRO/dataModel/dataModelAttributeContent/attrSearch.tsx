import searchIcon from 'assets/images/search.svg';
import { useState } from 'react';

function AttrSearch({ submitSearchForm }: any) {
  const [wordText, setWordText] = useState('');

  const newSearchOption = {
    curPage: 0,
    word: wordText,
  };

  const handleSubmit = () => {
    submitSearchForm(newSearchOption);
  };

  const handleKeyPress = (e: any) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="search-form">
      <fieldset className="input-wrapper search-input">
        <input
          className=""
          placeholder="검색어를 입력하세요"
          value={wordText}
          onChange={(e) => setWordText(e.target.value)}
          onKeyDown={handleKeyPress}
        />
        <button type="button" onClick={handleSubmit}>
          <img src={searchIcon} alt="검색" />
        </button>
      </fieldset>
    </div>
  );
}

export default AttrSearch;
