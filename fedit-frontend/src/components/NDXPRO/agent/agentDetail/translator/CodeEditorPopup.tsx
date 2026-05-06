import { java } from '@codemirror/lang-java';
import ReactCodeMirror from '@uiw/react-codemirror';
import { useState } from 'react';

import { postTranslatorCompile } from 'apis/NDXPRO/translatorApi';
import RectangleButton2 from 'components/NDXPRO/common/button/rectangleButton2';
import Loading from 'components/NDXPRO/common/loading';
import ModalContainer from 'components/NDXPRO/common/modalContainer';
import {
  TranslatorCompileRequest,
  TranslatorCompileResponse,
} from 'types/translator';

interface IProps {
  translateCode: string;
  onChangeCode: (value: string) => void;
  translateName: string;
  closeCodeEditor: () => void;
  onSuccessCompile: () => void;
  onFailCompile: () => void;
}

function CodeEditorPopup({
  translateCode,
  onChangeCode,
  translateName,
  closeCodeEditor,
  onSuccessCompile,
  onFailCompile,
}: IProps) {
  const [compileResult, setCompileResult] =
    useState<TranslatorCompileResponse>();

  const [resopnseText, setResponseText] = useState('');

  const [compileLoading, setCompileLoading] = useState(false);

  const onCompileButtonEvent = async () => {
    try {
      const payload: TranslatorCompileRequest = {
        name: translateName,
        translateCode,
      };
      setCompileLoading(true);
      const data = await postTranslatorCompile(payload);
      setCompileResult(data);

      const responseText =
        data.exitCode === 0
          ? data.output
          : `${data.output}\n// ==============================|| Error Message ||============================== //\n\n${data.error}`;

      setResponseText(responseText);
      setCompileLoading(false);

      if (data.exitCode === 0) {
        onSuccessCompile();
      } else {
        onFailCompile();
      }
    } catch (error) {
      alert('에러가 발생하였습니다. 개발팀에 문의주세요');
      console.log(error);
    }
  };

  return (
    <ModalContainer
      title="Translate Code"
      closeEvent={closeCodeEditor}
      className="code-editor-popup"
    >
      <ReactCodeMirror
        value={translateCode}
        height="400px"
        extensions={[java()]}
        className="code-mirror"
        onChange={onChangeCode}
      />
      <div className="button-wrapper">
        <RectangleButton2
          type="button"
          theme="blue"
          onClick={onCompileButtonEvent}
        >
          Compile
        </RectangleButton2>
        <RectangleButton2
          type="button"
          theme="deep-gray"
          onClick={closeCodeEditor}
        >
          Close
        </RectangleButton2>
      </div>
      <label>
        <strong>Response</strong>
        {compileResult && (
          <>
            {(() => {
              switch (compileResult?.exitCode) {
                case 0:
                  return <span className="compile-status blue">Success</span>;
                case 1:
                  return (
                    <span className="compile-status red">
                      Fail - checkout Error Message
                    </span>
                  );
                default:
                  return (
                    <span className="compile-status">
                      Error - 개발자에게 문의해주세요.
                    </span>
                  );
              }
            })()}
          </>
        )}
        <textarea
          rows={10}
          cols={100}
          value={compileLoading ? '' : resopnseText}
          readOnly
        />
        {compileLoading && <Loading />}
      </label>
    </ModalContainer>
  );
}

export default CodeEditorPopup;
