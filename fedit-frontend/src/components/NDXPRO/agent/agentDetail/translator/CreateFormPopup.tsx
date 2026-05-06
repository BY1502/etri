import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createTranslator,
  getTranslatorSample,
} from 'apis/NDXPRO/translatorApi';
import RectangleButton2 from 'components/NDXPRO/common/button/rectangleButton2';
import Loading from 'components/NDXPRO/common/loading';
import ModalContainer from 'components/NDXPRO/common/modalContainer';
import Select from 'components/NDXPRO/common/select';
import useRefreshTrigger from 'components/NDXPRO/hooks/useRefreshTrigger';
import { ErrorResponseType } from 'types/error';
import { agentModel } from 'types/ingest';
import { TranslatorCreateRequest } from 'types/translator';
import CodeEditorPopup from './CodeEditorPopup';

interface IProps {
  agentId: number;
  modelInfoList: agentModel[];
  closeCreateFormPopup: () => void;
}

function CreateFormPopup({
  agentId,
  modelInfoList,
  closeCreateFormPopup,
}: IProps) {
  // request state
  const [sourceTopic, setSourceTopic] = useState('');
  const [translateNameValue, setTranslateNameValue] = useState('');
  const [modelTypeValue, setModelTypeValue] = useState(
    modelInfoList[0].modelType,
  );
  const modelTypeSelectedList = useMemo(() => {
    return modelInfoList.map((modelType) => {
      return {
        label: modelType.modelType,
        value: modelType.modelType,
      };
    });
  }, [modelInfoList]);
  const [translateCode, setTranslateCode] = useState('');

  const [successCompile, setSuccessCompile] = useState<null | boolean>(null);

  const translateNameInputRef = useRef<HTMLInputElement>(null);
  const sourceTopicInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const [codeEditorToggle, setCodeEditorToggle] = useState(false);

  useEffect(() => {
    if (translateCode.length === 0) return;

    setTranslateCode('');
    setSuccessCompile(null);
  }, [translateNameValue]);

  const closeCodeEditor = () => {
    setCodeEditorToggle(false);
  };

  const openCodeEditor = async () => {
    if (translateNameValue !== '') {
      setCodeEditorToggle(true);
      if (translateCode === '') {
        const translatorCodeTemplate =
          await getTranslatorSample(translateNameValue);
        setTranslateCode(translatorCodeTemplate);
      }
    } else {
      translateNameInputRef.current?.focus();
      alert('translator의 Name을 먼저 설정해주세요.');
    }
  };

  const onChangeCode = (value: string) => {
    setTranslateCode(value);
  };

  const onSuccessCompile = () => {
    setSuccessCompile(true);
  };

  const onFailCompile = () => {
    setSuccessCompile(false);
  };

  const { refreshTrigger } = useRefreshTrigger();

  const submitNewTransltor = async () => {
    if (sourceTopic.length === 0) {
      sourceTopicInputRef.current?.focus();
      alert('입력창을 채워주세요.');
      return;
    }

    const context = modelInfoList.find(
      (el) => el.modelType === modelTypeValue,
    )?.context;

    if (context === undefined) return;

    const payload: TranslatorCreateRequest = {
      agentId,
      name: translateNameValue,
      modelType: modelTypeValue,
      context,
      translateCode,
      isCustomTopic: true,
      sourceTopic,
    };

    if (successCompile === true) {
      try {
        setLoading(true);
        await createTranslator(payload);
        setSuccessCompile(null);
        closeCreateFormPopup();
        setLoading(false);
        refreshTrigger();
        alert('Translator 생성되었습니다.');
      } catch (error) {
        setLoading(false);
        console.log(error);
        if (axios.isAxiosError(error)) {
          const errorResponse = error.response?.data as ErrorResponseType;
          alert(errorResponse.detail);
        } else {
          alert('예상치 못한 에러가 발생하였습니다. 개발팀에 문의주세요.');
        }
      }
    } else {
      setSuccessCompile(false);
      alert('translate code가 compile되었는지 확인해주세요.');
    }
  };

  return (
    <ModalContainer
      title="Add New Translator"
      closeEvent={closeCreateFormPopup}
      className="create-form-popup"
    >
      <table>
        <tbody>
          <tr>
            <th>Name</th>
            <td>
              <input
                type="text"
                value={translateNameValue}
                onChange={(e) => setTranslateNameValue(e.target.value)}
                ref={translateNameInputRef}
              />
            </td>
          </tr>
          <tr>
            <th>Model Type</th>
            <td>
              <Select
                selectedValue={modelTypeValue}
                dataList={modelTypeSelectedList}
                onChange={(e) => setModelTypeValue(e.target.value)}
              />
            </td>
          </tr>
          <tr>
            <th>Topic of data to be translated</th>
            <td>
              <input
                type="text"
                value={sourceTopic}
                onChange={(e) => setSourceTopic(e.target.value)}
                ref={sourceTopicInputRef}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <th>Translate Code</th>
            <td>
              <RectangleButton2
                type="button"
                theme="blue"
                onClick={openCodeEditor}
              >
                Open Editor
              </RectangleButton2>
              {successCompile === true && (
                <strong className="compile-status blue">Compiled</strong>
              )}
              {successCompile === false && (
                <strong className="compile-status red">
                  failed Compile - check your code
                </strong>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="button-wrapper">
        <RectangleButton2
          type="button"
          theme="blue"
          onClick={submitNewTransltor}
        >
          Save
        </RectangleButton2>
        <RectangleButton2
          type="button"
          theme="deep-gray"
          onClick={closeCreateFormPopup}
        >
          Close
        </RectangleButton2>
      </div>

      {codeEditorToggle && (
        <CodeEditorPopup
          translateCode={translateCode}
          onChangeCode={onChangeCode}
          translateName={translateNameValue}
          closeCodeEditor={closeCodeEditor}
          onSuccessCompile={onSuccessCompile}
          onFailCompile={onFailCompile}
        />
      )}
      {loading && (
        <div className="full-loading-screen">
          <Loading />
        </div>
      )}
    </ModalContainer>
  );
}

export default CreateFormPopup;
