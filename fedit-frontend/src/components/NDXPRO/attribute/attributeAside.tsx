import { getAllAttrWithPage } from 'apis/NDXPRO/attributeApi';
import { getAllModelWithPage } from 'apis/NDXPRO/modelApi';
// import { UseInfo } from 'hooks/useInfo';
import arrowLeft from 'assets/images/arrow_left.svg';
import arrowRight from 'assets/images/arrow_right.svg';
import doubleArrowLeft from 'assets/images/double_arrow_left.svg';
import doubleArrowRight from 'assets/images/double_arrow_right.svg';
import ModelAttrSearch from 'components/NDXPRO/common/modelAttrSearch';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import PagingList from './pagingList';

interface IProps {
  pagePath?: string;
}

function AttributeAside({ pagePath }: IProps) {
  const pageCount = 5;
  const listCount = 22;

  const [lastpage, setLastPage] = useState(0);
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(pageCount);
  const [list, setList] = useState<any[]>([]);

  const [searchOption, setSearchOption] = useState({
    curPage: pageStart - 1,
    size: listCount,
  });

  const updatePage = () => {
    if (pagePath === 'data-model') {
      getAllModelWithPage(searchOption)
        .then((res) => {
          setList(res.data);
          setLastPage(res.totalPage);
        })
        .catch(() => {
          setList([]);
          setLastPage(1);
        });
    }
    if (pagePath === 'attribute') {
      getAllAttrWithPage(searchOption)
        .then((res) => {
          setList(res.data);
          setLastPage(res.totalPage);
        })
        .catch(() => {
          setList([]);
          setLastPage(1);
        });
    }
  };

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
    const pageSet = lastpage - (lastpage % pageCount);

    if (lastpage % pageCount === 0) {
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
      .filter((e) => e <= lastpage)
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

  // if (!info) {
  //   return <ErrorBox text="사용자 정보가 없습니다." />;
  // }

  return (
    <aside className="attribute-accordion-aside">
      <div className="title-wrapper">
        <div className="title">
          {pagePath === 'data-model' ? 'Data Model' : 'Attribute'}
        </div>
      </div>
      <ModelAttrSearch
        pagePath={pagePath}
        searchOption={{ ...searchOption }}
        setSearchOption={setSearchOption}
      />
      <div className="attr-aside">
        <div className="attr-accordion">
          <PagingList
            pagePath={pagePath}
            attrList={list}
            listCount={listCount}
          />
        </div>
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
              disabled={pageEnd >= lastpage}
            >
              <img src={arrowRight} alt="다음" />
            </button>
            <button
              type="button"
              onClick={() => useLast()}
              disabled={pageEnd >= lastpage}
            >
              <img src={doubleArrowRight} alt="끝으로" />
            </button>
          </div>
        </div>
      </div>

      <div className="accordion-aside-rectangle-button">
        <NavLink
          to={{
            pathname: `${
              pagePath === 'data-model'
                ? '/service-description-tool/object-data-model-management'
                : '/service-description-tool/model-management/newAttr'
            }`,
          }}
        >
          {pagePath === 'data-model' ? '새 모델 생성' : '새 속성 생성'}
        </NavLink>
      </div>
    </aside>
  );
}

export default AttributeAside;
