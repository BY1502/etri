import SearchIcon from 'assets/images/search.svg';

import React, { Dispatch, SetStateAction, useState } from 'react';

interface IProps {
  emitSearchKeyword: Dispatch<SetStateAction<string>>;
}

function SearchInput({ emitSearchKeyword }: IProps) {
  const [searchKeyword, setSearchKeyword] = useState('');

  const changeSearchKeyword = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchKeyword(e.target.value);
  };

  const submitSearchKeyword = () => {
    emitSearchKeyword(searchKeyword.trim());
  };

  const enterSubmitSearchKeyword = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') {
      submitSearchKeyword();
    }
  };

  return (
    <div className="search-input-wrapper">
      <input
        type="text"
        placeholder="search..."
        value={searchKeyword}
        onKeyUp={enterSubmitSearchKeyword}
        onChange={changeSearchKeyword}
      />
      <button type="button" onClick={submitSearchKeyword}>
        <img src={SearchIcon} alt="검색버튼" />
      </button>
    </div>
  );
}

export default SearchInput;
