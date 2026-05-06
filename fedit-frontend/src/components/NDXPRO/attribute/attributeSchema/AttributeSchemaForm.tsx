import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  createAttributeSchema,
  deleteAttributeSchema,
  getAttributeAtAttributeSchema,
  updateAttributeSchema,
} from 'apis/NDXPRO/attributeSchemaApi';
import axios from 'axios';
import ErrorBox from 'components/NDXPRO/common/errorBox';
import Input from 'components/NDXPRO/common/input';
import { AttributeSchemaReqType } from 'types/attributeSchema';
// import { isAdminUser } from 'utils/auth';
import { RectangleButton } from 'components/NDXPRO/common/button/button';
import { errorMessage, successMessage } from 'constants/message';
import { ErrorResponseType } from 'types/error';
import AttributeSchemaStructure from './AttributeSchemaStructure';

interface IProps {
  attributeListAtSchema: string[];
  isCreate: boolean;
  isUpdate: boolean;
  isReadOnly: boolean;
  setIsCreate: Dispatch<SetStateAction<boolean>>;
  setIsUpdate: Dispatch<SetStateAction<boolean>>;
  setIsReadOnly: Dispatch<SetStateAction<boolean>>;
  setAttributeListAtSchema: Dispatch<SetStateAction<string[]>>;
}

function AttributeSchemaForm({
  attributeListAtSchema,
  isCreate,
  isUpdate,
  isReadOnly,
  setIsCreate,
  setIsUpdate,
  setIsReadOnly,
  setAttributeListAtSchema,
}: IProps) {
  const param = useParams();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [errorText, setErrorText] = useState('');
  const [schemaIdInputValue, setSchemaIdInputValue] = useState('');

  useEffect(() => {
    setErrorText('');
    if (param.attributeSchemaId === undefined) {
      setSchemaIdInputValue('');
      setIsCreate(true);
      setIsReadOnly(false);
    } else {
      setIsCreate(false);
      setSchemaIdInputValue(param.attributeSchemaId);
    }
  }, [param.attributeSchemaId]);

  const onClickCreateSchema = async () => {
    if (schemaIdInputValue === '') {
      setErrorText(errorMessage.requiredField('Schema ID'));
      inputRef.current?.focus();
      return;
    }

    const reqBody: AttributeSchemaReqType = {
      id: schemaIdInputValue,
      attributes: attributeListAtSchema,
      isReadOnly: false,
    };

    try {
      await createAttributeSchema({ reqBody });

      setErrorText('');
      alert(successMessage.create());
      navigate(`/attribute-schema/${schemaIdInputValue}?refresh=true`);
      setIsCreate(false);
    } catch (error) {
      let errMsg = errorMessage.default;

      if (axios.isAxiosError(error)) {
        const errorResponse = error.response?.data as ErrorResponseType;
        errMsg = errorResponse.detail;
        inputRef.current?.focus();
      }

      setErrorText(errMsg);
      console.log(error);
    }
  };

  const onClickUpdateSchema = () => {
    if (param.attributeSchemaId === undefined) return;
    const reqBody: AttributeSchemaReqType = {
      id: param.attributeSchemaId,
      attributes: attributeListAtSchema,
    };

    updateAttributeSchema(reqBody)
      .then(() => {
        setErrorText('');
        setIsUpdate(false);
        alert(successMessage.update());
        navigate('?refresh=true');
      })
      .catch((err) => {
        setErrorText(errorMessage.default);
        console.log(err);
      });
  };

  const onClickDeleteSchema = async () => {
    const { attributeSchemaId } = param;
    if (
      attributeSchemaId === undefined ||
      !window.confirm('해당 Attribute Schema를 삭제하시겠습니까?')
    )
      return;

    try {
      const data = await getAttributeAtAttributeSchema(attributeSchemaId);
      const attributeList = Object.keys(data.value);

      if (attributeList.length !== 0) {
        setErrorText(errorMessage.delete('attribute'));
        return;
      }

      await deleteAttributeSchema(attributeSchemaId);
      setErrorText('');
      alert(successMessage.delete());
      navigate('/attribute-schema?refresh=true');
    } catch (error) {
      let errMsg = errorMessage.default;

      if (axios.isAxiosError(error)) {
        const errorResponse = error.response?.data as ErrorResponseType;
        errMsg = errorResponse.title;
      }

      setErrorText(errMsg);
      console.log(error);
    }
  };

  return (
    <article className="schema-form">
      <form method="POST" onSubmit={(e) => e.preventDefault()}>
        <div className="schema-input-wrapper">
          {errorText && <ErrorBox text={errorText} />}
          <Input
            label="Schema ID"
            propValue={schemaIdInputValue}
            placeholder="custom-schema.json"
            setState={setSchemaIdInputValue}
            isRequired
            isUnable={!isCreate}
            inputRef={inputRef}
          />
        </div>
        <AttributeSchemaStructure
          attributeListAtSchema={attributeListAtSchema}
          isUpdate={isUpdate}
          isReadOnly={isReadOnly}
          setIsReadOnly={setIsReadOnly}
          setAttributeListAtSchema={setAttributeListAtSchema}
        />
        {!isReadOnly && (
          <div className="button-wrapper">
            {isUpdate ? (
              <>
                <RectangleButton
                  type="add"
                  text="저장"
                  onClick={onClickUpdateSchema}
                />
                {!isCreate && (
                  <RectangleButton
                    type="cancle"
                    text="취소"
                    onClick={() => {
                      setIsUpdate(false);
                      navigate('?refresh=true');
                    }}
                  />
                )}
              </>
            ) : (
              <>
                <RectangleButton
                  type={isCreate ? 'add' : 'etc'}
                  text={isCreate ? '생성' : '수정'}
                  onClick={
                    isCreate
                      ? onClickCreateSchema
                      : () => {
                          setIsUpdate(true);
                          navigate('?refresh=false');
                        }
                  }
                />
                {!isCreate && (
                  <RectangleButton
                    type="cancle"
                    text="삭제"
                    onClick={onClickDeleteSchema}
                  />
                )}
              </>
            )}
          </div>
        )}
      </form>
    </article>
  );
}

export default AttributeSchemaForm;
