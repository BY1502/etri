import arrowDownIcon from 'assets/images/arrow_down.svg';
import arrowUpIcon from 'assets/images/arrow_up.svg';
import playIcon from 'assets/images/play.svg';
import stopIcon from 'assets/images/play_stop.svg';

import { patchTranslatorControl } from 'apis/NDXPRO/translatorApi';
import StatusLabel from 'components/NDXPRO/common/statusLabel';
import useRefreshTrigger from 'components/NDXPRO/hooks/useRefreshTrigger';
import { useEffect, useState } from 'react';
import { TranslatorType } from 'types/translator';
import { convertFullDateTimeFromString } from 'utils/date';

interface IProps {
  translator: TranslatorType;
  isEdit: boolean;
  isActive: boolean;
  onChangeTabToggle: () => void;
}

function TranslatorHeader({
  translator,
  isEdit,
  isActive,
  onChangeTabToggle,
}: IProps) {
  const [translatorData, setTranslatorData] =
    useState<TranslatorType>(translator);

  useEffect(() => {
    setTranslatorData(translator);
  }, [translator]);

  const { refreshTrigger } = useRefreshTrigger();

  const onClickActivateTranslator = async () => {
    await patchTranslatorControl(translatorData.id, {
      operation: 'run',
    });

    refreshTrigger();
  };

  const onClickDeactivateTranslator = async () => {
    await patchTranslatorControl(translatorData.id, {
      operation: 'stop',
    });

    refreshTrigger();
  };

  return (
    <header className="translator-header-wrapper">
      <div className="header-inner">
        <h3>{translatorData.name}</h3>
        <span>
          {translatorData.lastSignalDatetime &&
            convertFullDateTimeFromString(translatorData.lastSignalDatetime)}
        </span>
        {!isEdit && (
          <>
            <button
              type="button"
              disabled={['RUN', 'HANG'].includes(translatorData.status)}
              onClick={onClickActivateTranslator}
            >
              <img src={playIcon} alt="실행" />
            </button>
            <button
              type="button"
              disabled={['STOP', 'DIE', 'CREATED'].includes(
                translatorData.status,
              )}
              onClick={onClickDeactivateTranslator}
            >
              <img src={stopIcon} alt="중지" />
            </button>
          </>
        )}
        <StatusLabel type={translatorData.status} />
      </div>
      <button
        type="button"
        className="tab-toggle-btn"
        onClick={onChangeTabToggle}
      >
        <img src={isActive ? arrowUpIcon : arrowDownIcon} alt="탭 토글 버튼" />
      </button>
    </header>
  );
}

export default TranslatorHeader;
