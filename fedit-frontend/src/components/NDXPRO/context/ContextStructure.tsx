import {
  AddContextModelData,
  changeStatusContext,
  createContextData,
  deleteContextData,
  getContextDetailData,
  SubContextModelData,
} from 'apis/NDXPRO/contextApi';
import DatamodelImg from 'assets/images/data_model.svg';
import EntityImg from 'assets/images/entity.svg';
import RemoveIcon from 'assets/images/remove_circle.svg';
import { RectangleButton } from 'components/NDXPRO/common/button/button';
import ErrorBox from 'components/NDXPRO/common/errorBox';
import Input from 'components/NDXPRO/common/input';
import { errorMessage, successMessage } from 'constants/message';
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ContextModelDTO, ContextModelVO } from 'types/context';
import { ErrorResponseType } from 'types/error';
import { makeContextIdWithVersion } from 'utils/common';

interface Iprops {
  toggle: boolean;
  setToggle: Dispatch<SetStateAction<boolean>>;
  ContextModelList: ContextModelVO[];
  setContextModelList: Dispatch<SetStateAction<ContextModelVO[]>>;
  contextId: string;
  setContextId: Dispatch<SetStateAction<string>>;
}
// const param = useParams();

function ContextStructure({
  toggle,
  setToggle,
  ContextModelList,
  setContextModelList,
  contextId,
  setContextId,
}: Iprops) {
  const param = useParams();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  //* 상태값은 IsCreate와 IsEdit 2가지로 구분한다
  const [isCreate, setIsCreate] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [errorText, setErrorText] = useState('');
  //* isReady 속성 추가 09/04 sclee
  const [isReady, setIsReady] = useState('');
  const [prevContextModelList, setPrevContextModelList] = useState<
    ContextModelVO[]
  >([]);

  const defaultData = {
    e8ight: 'https://e8ight-data-models/',
    common: 'https://e8ight-data-models/common/',
    'ngsi-ld': 'https://uri.etsi.org/ngsi-ld/',
  };

  // const makeContextIdWithVersion = (contextId: string) => {
  //   const index = contextId.indexOf('.jsonld');
  //   const contextIdWithVersion = `${contextId.slice(
  //     0,
  //     index,
  //   )}-v1.0.1${contextId.slice(index, contextId.length)}`;
  //   return contextIdWithVersion;
  // };

  const reqBody: ContextModelDTO = {
    url: makeContextIdWithVersion(contextId),
    // url: contextId,
    version: 'v1.0.1',
    defaultUrl: contextId,
    '@context': defaultData,
  };

  const validator = (): boolean => {
    const strIdx = contextId.indexOf('jsonld');
    const len = contextId.length;
    const result = false;
    if (contextId === '') {
      setErrorText(errorMessage.requiredField('contextURI'));
      inputRef.current?.focus();
      return result;
    }
    if (len - strIdx !== 6) {
      setErrorText(errorMessage.jsonld('jsonlD'));
      inputRef.current?.focus();
      return result;
    }
    return true;
  };

  const initData = () => {
    const result = Object.keys(defaultData);
    const arr: ContextModelVO[] = [];

    result.forEach((item) => {
      const type = 'attr';
      const title = item;
      arr.push({ type, title });
    });
    setContextModelList(arr);
  };

  const onClickCreateContext = () => {
    const isCorrect = validator();
    if (isCorrect) {
      createContextData(reqBody)
        .then((res) => {
          const arr: string[] = [];
          ContextModelList.forEach((item) => {
            if (item.type === 'Model') arr.push(item.title);
          });
          AddContextModelData(makeContextIdWithVersion(contextId), arr);
          setErrorText('');
          alert(successMessage.create());
          window.location.replace(
            `/context/${encodeURIComponent(
              makeContextIdWithVersion(contextId),
            )}`,
          );
        })
        .catch((err) => {
          let errMsg = errorMessage.default;
          const errorResponse = err.response?.data as ErrorResponseType;
          errMsg = errorResponse.detail;
          inputRef.current?.focus();
          setErrorText(errMsg);
        });
    }
  };

  //* 기존 ContextList와 현재 반영할 ContextList 비교 함수
  const onClickEditContext = () => {
    const original = prevContextModelList
      .filter((item) => item.type === 'Model')
      .map((item) => item.title);
    const compare = ContextModelList.filter(
      (item) => item.type === 'Model',
    ).map((item) => item.title);
    const addItem = compare.filter((item) => !original.includes(item));
    const subItem = original.filter((item) => !compare.includes(item));
    AddContextModelData(contextId, addItem)
      .then(() => {
        SubContextModelData(contextId, subItem)
          .then(() => {
            setErrorText('');
            alert(successMessage.update());
            // window.location.replace(
            //   `/context/${encodeURIComponent(contextId)}`,
            // );
            navigate(`/context/${encodeURIComponent(contextId)}`);
          })
          .catch((err) => {
            let errMsg = errorMessage.default;
            const errorResponse = err.response?.data as ErrorResponseType;
            errMsg = errorResponse.detail;
            setErrorText(errMsg);
          });
      })
      .catch((err) => {
        let errMsg = errorMessage.default;
        const errorResponse = err.response?.data as ErrorResponseType;
        errMsg = errorResponse.detail;
        setErrorText(errMsg);
      });
  };

  const onClickDeleteContext = () => {
    const arr = ContextModelList.filter((item) => item.type === 'Model');
    if (arr.length !== 0) {
      setErrorText('모델이 포함되어있으면 삭제할 수 없습니다');
      return;
    }
    if (window.confirm('삭제 하시겠습니까?')) {
      deleteContextData(contextId)
        .then(() => {
          alert(successMessage.delete());
          window.location.replace('/context');
        })
        .catch((err) => {
          let errMsg = errorMessage.default;
          const errorResponse = err.response?.data as ErrorResponseType;
          errMsg = errorResponse.detail;
          setErrorText(errMsg);
        });
    } else {
      alert('취소되었습니다');
    }
  };

  const onClickChangeStatusContext = () => {
    if (window.confirm('상태를 변경 하시겠습니까?')) {
      changeStatusContext(contextId)
        .then(() => {
          alert(successMessage.update());
          // window.location.replace('/context');
          window.location.reload();
        })
        .catch((err) => {
          let errMsg = errorMessage.default;
          const errorResponse = err.response?.data as ErrorResponseType;
          errMsg = errorResponse.detail;
          setErrorText(errMsg);
        });
    } else {
      alert('취소되었습니다');
    }
  };

  const onClickDeleteDataModel = (data: string) => {
    setContextModelList(ContextModelList.filter((item) => item.title !== data));
  };

  useEffect(() => {
    if (param.contextId === null || param.contextId === 'newContext') {
      setIsEdit(false);
      setIsCreate(true);
      initData();
      setErrorText('');
      // setContextModelList([]);
    } else {
      setIsCreate(false);
      setIsEdit(false);
      setErrorText('');

      getContextDetailData(param.contextId as string).then((res) => {
        const arr: ContextModelVO[] = [];
        const data = res['@context'] ? Object.keys(res['@context']) : [];
        const status = res.dataModelStatus;
        data.forEach((item) => {
          const type = item.match(/^[A-Z]/) ? 'Model' : 'attr';
          const title = item;
          arr.push({ type, title });
        });
        setContextModelList(arr);
        setPrevContextModelList(arr);
        setIsReady(res.isReady);
      });
    }
  }, [param]);

  return (
    <div className="context-model-structure">
      <div className="context-model-form-input-wrapper">
        {errorText && <ErrorBox text={errorText} />}
        <Input
          label="Context URI"
          setState={setContextId}
          propValue={contextId}
          placeholder="http://172.16.28.218:3005/e8ight-context.jsonld"
          isRequired
          isUnable={!isCreate}
          inputRef={inputRef}
        />
      </div>
      <strong>Context Structure </strong>
      <div className="context-model-structure-wrapper">
        <ul>
          {ContextModelList.map((data) => {
            return (
              <li key={Math.random()}>
                <div className="context-model-list">
                  <img
                    src={data.type === 'Model' ? DatamodelImg : EntityImg}
                    alt=""
                  />
                  <p>{data.title}</p>
                </div>
                {data.type === 'Model' && toggle && (
                  <button
                    type="button"
                    onClick={() => onClickDeleteDataModel(data.title)}
                  >
                    <img src={RemoveIcon} alt="모델 등록 취소" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {/* {getCookie('auth') === 'ADMIN' ? ( */}
      <div className="context-control-button">
        {/* isEdit은 수정 모드 진입 시 변경된다 */}
        {isEdit ? (
          <>
            <RectangleButton
              type="add"
              text="Save"
              onClick={() => onClickEditContext()}
            />
            <RectangleButton
              type="cancle"
              text="Cancel"
              onClick={() => {
                window.location.reload();
              }}
            />
          </>
        ) : (
          <>
            {isCreate && (
              <RectangleButton
                type="add"
                text="Create"
                onClick={onClickCreateContext}
              />
            )}
            {!isCreate && !isReady && (
              <RectangleButton
                type={isCreate ? 'add' : 'etc'}
                text={isCreate ? 'Create' : 'Edit'}
                onClick={() => {
                  setToggle(true);
                  setIsEdit(true);
                }}
              />
            )}

            {!isCreate && !isReady && (
              <RectangleButton
                type="cancle"
                text="Remove"
                onClick={onClickDeleteContext}
              />
            )}

            {!isReady && !isCreate && (
              <RectangleButton
                type="add"
                text="Change status to Ready"
                onClick={onClickChangeStatusContext}
              />
            )}
          </>
        )}
      </div>
      {/* ) 
      : (
        <div> </div>
      )} */}
    </div>
  );
}

export default ContextStructure;
