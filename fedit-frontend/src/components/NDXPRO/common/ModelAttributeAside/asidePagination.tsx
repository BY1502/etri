import { useEffect, useState } from 'react';
import { IModelAttributeAsideSearch } from 'types/common';

import { ReactComponent as ArrowLeftIcon } from 'assets/images/arrow_left.svg';
import { ReactComponent as ArrowRightIcon } from 'assets/images/arrow_right.svg';
import AsidePaginationButton from 'components/NDXPRO/common/ModelAttributeAside/asidePaginationButton';

function AsidePagination({
  totalPage,
  searchOption,
  setSearchOption,
}: {
  totalPage: number;
  searchOption: IModelAttributeAsideSearch;
  setSearchOption: (value: IModelAttributeAsideSearch) => void;
}) {
  const current = searchOption.curPage;
  if (current === undefined) {
    return <div />;
  }
  const paginationSize = 5;
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(1);

  useEffect(() => {
    setEnd(start + paginationSize - 1);
  }, [start]);

  const pageNumbers = () => {
    const arr = [];
    for (let i = start; i <= end; i += 1) {
      if (i <= totalPage) {
        arr.push(
          <AsidePaginationButton
            key={i}
            onClick={() => setSearchOption({ curPage: i - 1 })}
            active={i === current + 1}
          >
            {i}
          </AsidePaginationButton>,
        );
      }
    }
    return arr;
  };

  return (
    <div className="aside-pagination">
      <div>
        {start > paginationSize && (
          <AsidePaginationButton
            onClick={() => setStart((prev) => prev - paginationSize)}
          >
            <ArrowLeftIcon fill="#aaaaaa" />
          </AsidePaginationButton>
        )}
      </div>
      <div>
        {pageNumbers()}
        {end < totalPage && (
          <>
            <p>...</p>
            <AsidePaginationButton
              onClick={() => setSearchOption({ curPage: totalPage - 1 })}
              active={current === totalPage - 1}
            >
              {totalPage}
            </AsidePaginationButton>
          </>
        )}
      </div>
      <div>
        {end < totalPage && (
          <AsidePaginationButton
            onClick={() => setStart((prev) => prev + paginationSize)}
          >
            <ArrowRightIcon fill="#aaaaaa" />
          </AsidePaginationButton>
        )}
      </div>
    </div>
  );
}

export default AsidePagination;
