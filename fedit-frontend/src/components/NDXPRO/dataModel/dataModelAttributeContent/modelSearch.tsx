import searchMoreIconOn from 'assets/images/arrow_down.svg';
import searchMoreIconOff from 'assets/images/arrow_up_ndxpro.svg';
import searchIcon from 'assets/images/search.svg';

import SelectBox from 'components/NDXPRO/common/selectBox';
import { useEffect, useState } from 'react';

function ModelSearch({ submitSearchForm }: any) {
  const [searchToggle, setSearchToggle] = useState(false);

  const [wordText, setWordText] = useState('');
  const [isReadyText, setIsReadyText] = useState('');
  const [isReadyBool, setIsReadyBool]: any = useState();

  useEffect(() => {
    switch (isReadyText) {
      case 'isReady 전체':
        setIsReadyBool(undefined);
        break;
      case 'isReady true':
        setIsReadyBool(true);
        break;
      case 'isReady false':
        setIsReadyBool(false);
        break;
      default:
        break;
    }
  }, [isReadyText]);

  useEffect(() => {
    handleSubmit();
  }, [isReadyBool]);

  const newSearchOption = {
    curPage: 0,
    word: wordText,
    isReady: isReadyBool,
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
    <div className={searchToggle ? 'search-form show' : 'search-form'}>
      <fieldset className="input-wrapper search-input">
        <input
          className=""
          placeholder="검색어를 입력하세요"
          value={wordText}
          onChange={(e) => setWordText(e.target.value)}
          onKeyDown={handleKeyPress}
        />
        <button type="button" onClick={() => submitSearchForm(newSearchOption)}>
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
      <div className="search-more-form">
        <SelectBox
          label=""
          dataList={['isReady 전체', 'isReady true', 'isReady false']}
          setState={setIsReadyText}
          propValue={isReadyText}
        />
      </div>
    </div>
  );
}

export default ModelSearch;
