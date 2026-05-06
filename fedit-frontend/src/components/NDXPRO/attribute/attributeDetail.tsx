import {
  deleteAttrData,
  getAttrData,
  postAttrData,
  putAttrData,
} from 'apis/NDXPRO/attributeApi';
import { RectangleButton } from 'components/NDXPRO/common/button/button';
import ErrorContent from 'components/NDXPRO/common/error';
import ErrorBox from 'components/NDXPRO/common/errorBox';
import Input from 'components/NDXPRO/common/input';
import PathTitle from 'components/NDXPRO/common/pathTitle';
import SelectBox from 'components/NDXPRO/common/selectBox';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { attrInitData, onlyPropertyValueList } from 'utils/dataModelInitList';
import UsingDataModel from './usingDataModelList';

function DataModelAttrDetail() {
  const params = useParams();
  const nav = useNavigate();

  // const [info, isAdmin] = UseInfo();

  const [TreeData, setTreeData]: any = useState();
  const newAttrJson: any = {};

  const [errorMessage, setErrorMessage] = useState('');

  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState('');
  const [valueType, setValueType]: any = useState(onlyPropertyValueList[0]);
  const [type, setType] = useState('');

  const formRef = useRef<HTMLDivElement>(null);
  const formDiv: any = formRef.current;

  const isNewAttr = () => params.attrId === 'newAttr';
  const [isCustom, setIsCustom] = useState(true);
  const [isEditMode, setisEditMode] = useState(false);
  const [showUsingDataModel, setShowUsingDataModel] = useState(false);

  useLayoutEffect(() => {
    setErrorMessage('');
    setShowUsingDataModel(false);

    if (isNewAttr()) {
      setTreeData(attrInitData);
      setType('e8ight');
      setisEditMode(true);
    } else {
      getAttrData(params.attrId)
        .then((res) => {
          setTreeData(res);
          setType(res.type);
          setisEditMode(false);
        })
        .catch(() => {
          setTreeData(null);
        });
    }
  }, [params.attrId]);

  useEffect(() => {
    if (type === 'e8ight') {
      setIsCustom(true);
    } else {
      setIsCustom(false);
    }
  }, [type]);

  useEffect(() => {
    if (TreeData) {
      initAttrForm();
    }
  }, [TreeData]);

  const initAttrForm = () => {
    setId(TreeData.id);
    setTitle(TreeData.title);
    setDescription(TreeData.description);
    setValueType(TreeData.valueType);
    setFormat(TreeData.format);
  };

  useEffect(() => {
    newAttrJson.id = id;
    newAttrJson.valueType = valueType;
    newAttrJson.type = type;

    if (title) {
      newAttrJson.title = title;
    }
    if (format) {
      newAttrJson.format = format;
    }
    if (description) {
      newAttrJson.description = description;
    }
  }, [id, title, description, format, valueType, errorMessage, isEditMode]);

  const useSubmit = () => {
    if (!window.confirm('등록하시겠습니까?')) {
      return null;
    }
    return postAttrData(newAttrJson)
      .then(() => {
        setErrorMessage('');
        alert(`새 속성 '${id}'이(가) 등록되었습니다.`);
        nav(`/service-description-tool/model-management/${id}`);
        window.location.reload();
      })
      .catch((err) => {
        const errMsg = `${err.response.data.title} : ${err.response.data.detail}`;
        setErrorMessage(errMsg);
        formDiv.scrollTo(0, 0);
      });
  };

  const useUpdate = () => {
    putAttrData(newAttrJson)
      .then(() => {
        setErrorMessage('');
        alert(`속성 '${id}'이(가) 수정되었습니다.`);
        setisEditMode(false);
      })
      .catch((err) => {
        const errMsg = `${err.response.data.title} : ${err.response.data.detail}`;
        setErrorMessage(errMsg);
        formDiv.scrollTo(0, 0);
      });
  };

  // if (!info) {
  //   return <ErrorBox text="사용자 정보가 없습니다." />;
  // }

  if (TreeData === null) {
    return <ErrorContent errMsg="데이터를 불러올 수 없습니다." />;
  }

  return (
    <div className="attribute-detail">
      <div className="title-wrapper">
        {isNewAttr() && <h2 className="title">새 커스텀 속성</h2>}
        {!isNewAttr() && (
          <>
            <h2 className="title">속성</h2>
            <PathTitle path={[params.attrId]} />
          </>
        )}
      </div>
      <div className="attribute-detail-content">
        <div ref={formRef} className="attribute-detail-wrap">
          {errorMessage !== '' && (
            <ErrorBox text={errorMessage} closer={() => setErrorMessage('')} />
          )}
          <Input
            label="ID"
            setState={setId}
            isRequired
            propValue={id}
            isUnable={!isNewAttr()}
          />
          <Input
            label="Type"
            isRequired
            setState={setType}
            propValue={type}
            isUnable
          />
          <SelectBox
            label="ValueType"
            dataList={onlyPropertyValueList}
            setState={setValueType}
            isRequired
            propValue={valueType}
            isUnable={!isEditMode || !isCustom}
          />
          <Input
            label="Title"
            setState={setTitle}
            propValue={title}
            isUnable={!isEditMode || !isCustom}
          />
          <Input
            label="Description"
            setState={setDescription}
            propValue={description}
            isUnable={!isEditMode || !isCustom}
          />
          <Input
            label="Format"
            setState={setFormat}
            propValue={format}
            isUnable={!isEditMode || !isCustom}
          />
        </div>
        {!isNewAttr() && (
          <>
            <p className="model-type-title">Using Data Model</p>
            {!showUsingDataModel && (
              <RectangleButton
                type="add"
                text="Show Using Data Model"
                onClick={() => setShowUsingDataModel(true)}
              />
            )}
            {showUsingDataModel && <UsingDataModel />}
          </>
        )}
      </div>
      {isCustom && (
        <div className="data-model-attr-btns">
          {!isEditMode && (
            <>
              <RectangleButton
                type="remove"
                text="삭제"
                onClick={() => {
                  if (!window.confirm(`delete ${id}?`)) {
                    return;
                  }
                  deleteAttrData(id)
                    .then((res) => {
                      alert(res);
                      window.location.replace('/attribute');
                    })
                    .catch((err) => alert(err.response.data.detail));
                }}
              />
              <RectangleButton
                type="etc"
                text="수정"
                onClick={() => {
                  setisEditMode(true);
                }}
              />
            </>
          )}
          {isEditMode && (
            <RectangleButton
              type="add"
              text="저장"
              onClick={() => (isNewAttr() ? useSubmit() : useUpdate())}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default DataModelAttrDetail;
