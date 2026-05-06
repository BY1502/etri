import { useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';

import { getTranslators } from 'apis/NDXPRO/translatorApi';
import CreateFormPopup from 'components/NDXPRO/agent/agentDetail/translator/CreateFormPopup';
import TranslatorList from 'components/NDXPRO/agent/agentDetail/translator/TranslatorList';
import RectangleButton2 from 'components/NDXPRO/common/button/rectangleButton2';
import useRefreshTrigger from 'components/NDXPRO/hooks/useRefreshTrigger';
import { agentState } from 'store/atoms/ingestAtom';
import { TranslatorType } from 'types/translator';

function Translator() {
  const currentAgent = useRecoilValue(agentState);
  const [createFormToggle, setCreateFormToggle] = useState(false);

  const [translators, setTranslators] = useState<TranslatorType[]>([]);

  const updateTranslators = async () => {
    const response = await getTranslators({ agentId: currentAgent.id });
    setTranslators(response.data);
  };

  const { registerUpdateFuncion } = useRefreshTrigger();
  useEffect(() => {
    updateTranslators();
    registerUpdateFuncion([updateTranslators]);
  }, [currentAgent]);

  const closeCreateFormPopup = () => {
    setCreateFormToggle(false);
  };

  const openCreateFormPopup = () => {
    setCreateFormToggle(true);
  };

  return (
    <section className="translator-wrapper">
      <TranslatorList translators={translators} />
      <div>
        <RectangleButton2
          type="button"
          theme="blue"
          className="right-align"
          onClick={openCreateFormPopup}
        >
          New TransLator
        </RectangleButton2>
      </div>
      {createFormToggle && (
        <CreateFormPopup
          agentId={currentAgent.id}
          modelInfoList={currentAgent.models}
          closeCreateFormPopup={closeCreateFormPopup}
        />
      )}
    </section>
  );
}

export default Translator;
