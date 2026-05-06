// import helpIcon from 'assets/images/help.svg';
import axios from 'axios';
import { useState } from 'react';

import { deleteTranslator } from 'apis/NDXPRO/translatorApi';
import RectangleButton2 from 'components/NDXPRO/common/button/rectangleButton2';
import useRefreshTrigger from 'components/NDXPRO/hooks/useRefreshTrigger';
import { ErrorResponseType } from 'types/error';
import { TranslatorType } from 'types/translator';
import { convertFullDateTimeFromString } from 'utils/date';
import CodeViewerPopup from './CodeViewerPopup';

interface IProps {
  translator: TranslatorType;
  isEdit: boolean;
  onChangeIsEdit: () => void;
}

function TranslatorDetail({ translator, isEdit, onChangeIsEdit }: IProps) {
  const [codeViewerToggle, setCodeViewerToggle] = useState(false);
  const [sourceTopic, setSourceTopic] = useState(translator.sourceTopic);

  const openCodeViewer = () => {
    setCodeViewerToggle(true);
  };

  const closeCodeViewer = () => {
    setCodeViewerToggle(false);
  };

  const { refreshTrigger } = useRefreshTrigger();

  const onDeleteTranslator = async () => {
    if (['RUN', 'HANG'].includes(translator.status)) {
      alert('Translator를 중지한 후 삭제를 진행해주세요.');
      return;
    }

    try {
      if (window.confirm(`${translator.name}을 삭제하시겠습니까?`)) {
        await deleteTranslator(translator.id);
        alert('삭제되었습니다.');
        refreshTrigger();
      }
    } catch (error) {
      console.log(error);
      if (axios.isAxiosError(error)) {
        const errorResponse = error.response?.data as ErrorResponseType;
        alert(errorResponse.detail);
      }
    }
  };

  return (
    <div className="translator-detail-wrapper">
      <table>
        <tbody>
          <tr>
            <th>Name</th>
            <td className={isEdit ? 'edit' : ''}>
              {isEdit ? (
                <input type="text" value={translator.name} readOnly />
              ) : (
                <strong>{translator.name}</strong>
              )}
            </td>
          </tr>
          <tr>
            <th>Agent ID</th>
            <td>{translator.agentId}</td>
          </tr>
          <tr>
            <th>ID</th>
            <td>{translator.id}</td>
          </tr>
          <tr>
            <th>PID</th>
            <td>{translator.pid}</td>
          </tr>
          <tr>
            <th>Model Type</th>
            <td className={isEdit ? 'edit' : ''}>
              {isEdit ? (
                <select name="modelType">
                  <option value={translator.modelType}>
                    {translator.modelType}
                  </option>
                </select>
              ) : (
                <strong>{translator.modelType}</strong>
              )}
            </td>
          </tr>
          <tr>
            <th>Status</th>
            <td>{translator.status}</td>
          </tr>
          <tr>
            <th>Last Translation Time</th>
            <td>
              {translator.lastSignalDatetime &&
                convertFullDateTimeFromString(translator.lastSignalDatetime)}
            </td>
          </tr>
          <tr>
            <th>Topic of data to be translated</th>
            <td className={isEdit ? 'edit' : ''}>
              {isEdit ? (
                <input
                  type="text"
                  value={sourceTopic}
                  onChange={(event) => setSourceTopic(event.target.value)}
                />
              ) : (
                <span>{translator.sourceTopic}</span>
              )}
            </td>
          </tr>
          {/* <tr>
            <th>
              <div className="flex-horizontal">
                Transfer ObservedAt
                <button type="button">
                  <img src={helpIcon} alt="도움말" />
                </button>
              </div>
            </th>
            <td>
              {isEdit ? (
                <div className="cell-wrapper">
                  <select name="transferObservedAt">
                    <option value="true">true</option>
                  </select>
                  <label>
                    <span>Topic to produce observedAt</span>
                    <input
                      type="text"
                      value="Iji.dev.pintel.simul.new"
                      readOnly
                    />
                  </label>
                </div>
              ) : (
                <div className="cell-wrapper">
                  <p>true</p>
                  <p>
                    <span>Topic to produce observedAt</span>
                    Iji.dev.pintel.simul.new
                  </p>
                </div>
              )}
            </td>
          </tr> */}
        </tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <th>Translate Code</th>
            <td>
              {isEdit ? (
                <RectangleButton2 type="button" theme="blue">
                  Edit
                </RectangleButton2>
              ) : (
                <RectangleButton2
                  type="button"
                  theme="blue"
                  onClick={openCodeViewer}
                >
                  Viewer
                </RectangleButton2>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="btn-wrapper">
        {isEdit ? (
          <>
            <RectangleButton2
              type="button"
              theme="blue"
              onClick={onChangeIsEdit}
            >
              Save
            </RectangleButton2>
            <RectangleButton2
              type="button"
              theme="deep-gray"
              onClick={onChangeIsEdit}
            >
              Back
            </RectangleButton2>
          </>
        ) : (
          <>
            <RectangleButton2
              type="button"
              theme="blue"
              onClick={onChangeIsEdit}
            >
              Edit
            </RectangleButton2>
            <RectangleButton2
              type="button"
              theme="red"
              onClick={onDeleteTranslator}
            >
              Remove
            </RectangleButton2>
          </>
        )}
      </div>
      {codeViewerToggle && (
        <CodeViewerPopup
          translateCode={translator.translateCode}
          closeCodeViewer={closeCodeViewer}
        />
      )}
    </div>
  );
}

export default TranslatorDetail;
