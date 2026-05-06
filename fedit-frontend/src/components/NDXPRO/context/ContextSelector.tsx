import AddIcon from 'assets/images/add_circle.svg';
import LoadingIcon from 'assets/images/refresh.svg';
import {
  Dispatch,
  SetStateAction,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { getAllModelWithPage } from 'apis/NDXPRO/modelApi';
import DatamodelImg from 'assets/images/data_model.svg';
import EntitySearchInput from 'components/NDXPRO/common/searchInput';
import useScrollObserver from 'components/NDXPRO/hooks/useScrollObserver';
import { ContextModelVO } from 'types/context';

interface Iprops {
  ContextModelList: ContextModelVO[];
  setContextModelList: Dispatch<SetStateAction<ContextModelVO[]>>;
}

interface responseDTO {
  type: string;
  isReady: boolean;
}

function ContextSelector({ ContextModelList, setContextModelList }: Iprops) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [dataModelList, setDataModelList] = useState<responseDTO[]>([]);
  const listEl = useRef<HTMLUListElement>(null);
  const {
    observedRef,
    isLoading: isScrollLoading,
    observerController,
  } = useScrollObserver();
  const [isEnableScroll, setIsEnableScroll] = useState(true);
  const [pageCnt, setPageCnt] = useState(0);
  const [pageSize, setPageSize] = useState(0);

  useLayoutEffect(() => {
    if (listEl.current !== null) {
      const pageSize = Math.round(listEl.current.offsetHeight / 28) + 3;
      setIsEnableScroll(true);
      setPageSize(pageSize);
    }

    // destroy 영역
    return () => {
      setDataModelList([]);
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
      updateModelData(false, pageSize);
    }
  }, [isScrollLoading]);

  useEffect(() => {
    if (pageSize !== 0 && listEl.current !== null) {
      listEl.current.scroll({ top: 0 });
      updateModelData(true, pageSize);
      setIsEnableScroll(true);
    }
  }, [searchKeyword]);

  const updateModelData = async (isInit: boolean, pageSize: number) => {
    setPageCnt((prev) => (isInit ? 2 : prev + 1));
    const requestPayload = {
      curPage: isInit ? 0 : pageCnt,
      size: pageSize,
      word: searchKeyword,
      isReady: true,
    };
    const data = await getAllModelWithPage(requestPayload);

    setDataModelList((prev) => {
      return isInit ? data.data : [...prev, ...data.data];
    });

    if (data.data.length === 0 || pageSize > data.data.length) {
      setIsEnableScroll(false);
      observerController.stopObserver();
    }
  };

  const onClickPageLoader = () => {
    updateModelData(false, pageSize);
  };

  const onClickAddDataModel = (data: string) => {
    const title = data;
    const type = 'Model';
    const isUsing = false;
    setContextModelList((prev) => [...prev, { title, type, isUsing }]);
  };

  return (
    <div className="context-model-selector">
      <div className="context-model-selector-wrapper">
        <div className="title-wrapper">
          <h2>DataModel 추가</h2>
          {/* <button type="button" onClick={() => setToggle(!toggle)}>
            <img src={CloseIcon} alt="" />
          </button> */}
        </div>
        <EntitySearchInput emitSearchKeyword={setSearchKeyword} />
        <ul ref={listEl}>
          {dataModelList.map((item) => {
            return (
              <li key={item.type}>
                <div>
                  <img src={DatamodelImg} alt="" />
                  <span>{item.type}</span>
                </div>
                {!ContextModelList.find((data) => data.title === item.type) && (
                  <button
                    type="button"
                    onClick={() => onClickAddDataModel(item.type)}
                  >
                    <img src={AddIcon} alt="attribute 등록" />
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
    </div>
  );
}

export default ContextSelector;
