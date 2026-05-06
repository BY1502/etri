import { getAllAttrWithPage } from 'apis/NDXPRO/attributeApi';
import AddIcon from 'assets/images/add_circle.svg';
import ItemIcon from 'assets/images/entity.svg';
import LoadingIcon from 'assets/images/refresh.svg';
import EntitySearchInput from 'components/NDXPRO/common/searchInput';
import useScrollObserver from 'components/NDXPRO/hooks/useScrollObserver';
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { AttrListItemType } from 'types/attribute';
import { DataManagerPageResponseDTO } from 'types/common';

interface IProps {
  attributeListAtSchema: string[];
  setAttributeListAtSchema: Dispatch<SetStateAction<string[]>>;
}

function AttributeSelector({
  attributeListAtSchema,
  setAttributeListAtSchema,
}: IProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [attributeList, setAttributeList] = useState<AttrListItemType[]>([]);
  const listEl = useRef<HTMLUListElement>(null);
  const {
    observedRef,
    isLoading: isScrollLoading,
    observerController,
  } = useScrollObserver();
  const [isEnableScroll, setIsEnableScroll] = useState(true);
  const [pageCnt, setPageCnt] = useState(0);
  const [pageSize, setPageSize] = useState(0);

  useEffect(() => {
    if (listEl.current !== null) {
      listEl.current.scroll({ top: 0 });
      const pageSize = Math.round(listEl.current.offsetHeight / 28) + 10;
      setIsEnableScroll(true);
      setPageSize(pageSize);
    }

    return () => {
      setAttributeList([]);
      setPageCnt(0);
      setIsEnableScroll(false);
      observerController.stopObserver();
    };
  }, []);

  useEffect(() => {
    observerController.startObserver();
  }, [observedRef.current]);

  useEffect(() => {
    if (isScrollLoading === true) {
      updateAttributeData(false, pageSize);
    }
  }, [isScrollLoading]);

  useEffect(() => {
    if (pageSize !== 0 && listEl.current !== null) {
      listEl.current.scroll({ top: 0 });
      updateAttributeData(true, pageSize);
      setIsEnableScroll(true);
    }
  }, [searchKeyword]);

  const updateAttributeData = async (isInit: boolean, pageSize: number) => {
    setPageCnt((prev) => (isInit ? 1 : prev + 1));

    const requestPayload = {
      curPage: isInit ? 0 : pageCnt,
      size: pageSize,
      word: searchKeyword,
    };

    const response = (await getAllAttrWithPage(
      requestPayload,
    )) as DataManagerPageResponseDTO<AttrListItemType>;
    const { data } = response;

    const filteredAttributeList = data.filter(
      (attribute) => ['e8ight'].includes(attribute.type), // FIXME: common, core schema에 등록된 attribute 제외 로직 -> 하드 코딩 수정 필요
    );

    setAttributeList((prev) => {
      return isInit
        ? filteredAttributeList
        : [...prev, ...filteredAttributeList];
    });

    if (data.length === 0 || pageSize > data.length) {
      setIsEnableScroll(false);
      observerController.stopObserver();
    }
  };

  const onClickPageLoader = () => {
    updateAttributeData(false, pageSize);
  };

  const onClickAddAttribute = (attribute: string) => {
    setAttributeListAtSchema((prev) => [...prev, attribute]);
  };

  return (
    <div className="attribute-list-for-schema">
      <div className="title-wrapper">
        <h2>Attribute 추가</h2>
      </div>
      <EntitySearchInput emitSearchKeyword={setSearchKeyword} />
      <ul ref={listEl}>
        {attributeList.map((attributeInfo) => {
          return (
            <li key={attributeInfo.id}>
              <div>
                <img src={ItemIcon} alt="" />
                <span>{attributeInfo.id}</span>
              </div>
              {!attributeListAtSchema.includes(attributeInfo.id) && (
                <button
                  type="button"
                  onClick={() => onClickAddAttribute(attributeInfo.id)}
                >
                  <img src={AddIcon} alt="attribute 추가 버튼" />
                </button>
              )}
            </li>
          );
        })}
        {isEnableScroll && (
          <div ref={observedRef} className="scroll-loader">
            <button type="button" onClick={onClickPageLoader}>
              <img src={LoadingIcon} alt="페이지 추가 랜더링" />
            </button>
          </div>
        )}
      </ul>
    </div>
  );
}

export default AttributeSelector;
