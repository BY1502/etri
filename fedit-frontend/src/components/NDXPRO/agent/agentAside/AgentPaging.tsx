import arrowLeft from 'assets/images/arrow_left.svg';
import arrowRight from 'assets/images/arrow_right.svg';
import doubleArrowLeft from 'assets/images/double_arrow_left.svg';
import doubleArrowRight from 'assets/images/double_arrow_right.svg';
import { Dispatch, SetStateAction, useEffect } from 'react';

interface optionsProps {
  curPage: number;
  size?: number;
  name?: string;
  status?: boolean;
}

interface IProps {
  pageStart: number;
  setPageStart: Dispatch<SetStateAction<number>>;
  pageEnd: number;
  setPageEnd: Dispatch<SetStateAction<number>>;
  searchOption: optionsProps;
  setSearchOption: Dispatch<SetStateAction<any>>;
  lastPage: number;
  pageCount: number;
  updatePage: () => void;
}

function AgentPaging({
  pageStart,
  setPageStart,
  pageEnd,
  setPageEnd,
  searchOption,
  setSearchOption,
  lastPage,
  pageCount,
  updatePage,
}: IProps) {
  useEffect(() => {
    setSearchOption({ ...searchOption, curPage: pageStart - 1 });
  }, [pageStart]);

  useEffect(() => {
    updatePage();
  }, [searchOption]);

  const usePaging = (num: number) => {
    setPageStart(pageStart + num);
    setPageEnd(pageEnd + num);
  };

  const useLast = () => {
    const pageSet = lastPage - (lastPage % pageCount);

    if (lastPage % pageCount === 0) {
      setPageStart(() => pageSet - pageCount + 1);
      setPageEnd(() => pageSet);
    } else {
      setPageStart(() => pageSet + 1);
      setPageEnd(() => pageSet + pageCount);
    }
  };

  const useStart = () => {
    setPageStart(1);
    setPageEnd(pageCount);
  };

  const pageNumbers = () => {
    const array: any[] = [];
    for (let i = pageStart; i <= pageEnd; i += 1) {
      array.push(i);
    }
    return array
      .filter((e) => e <= lastPage)
      .map((e) => (
        <button
          type="button"
          className={e - 1 === searchOption.curPage ? 'active' : ''}
          key={e}
          onClick={() => {
            setSearchOption({ ...searchOption, curPage: e - 1 });
          }}
        >
          {e}
        </button>
      ));
  };
  return (
    <div className="attr-paging">
      <div>
        <button
          type="button"
          onClick={() => useStart()}
          disabled={pageStart <= 1}
        >
          <img src={doubleArrowLeft} alt="처음으로" />
        </button>
        <button
          type="button"
          onClick={() => usePaging(-pageCount)}
          disabled={pageStart <= 1}
        >
          <img src={arrowLeft} alt="이전" />
        </button>
      </div>
      <div className="attr-paging-numbers">{pageNumbers()}</div>
      <div>
        <button
          type="button"
          onClick={() => usePaging(pageCount)}
          disabled={pageEnd >= lastPage}
        >
          <img src={arrowRight} alt="다음" />
        </button>
        <button
          type="button"
          onClick={() => useLast()}
          disabled={pageEnd >= lastPage}
        >
          <img src={doubleArrowRight} alt="끝으로" />
        </button>
      </div>
    </div>
  );
}

export default AgentPaging;
