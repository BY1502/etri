import { getAgentList } from 'apis/NDXPRO/IngestApi';
import { useEffect, useState } from 'react';
import { agentDTO } from 'types/ingest';

import { RectangleButton } from 'components/NDXPRO/common/button/button';

import useRefreshTrigger from 'components/NDXPRO/hooks/useRefreshTrigger';
import { UseInfo } from 'hooks/useInfo';
import { useNavigate } from 'react-router-dom';
import { useRecoilState, useResetRecoilState } from 'recoil';
import {
  agentModelState,
  agentModeState,
  agentState,
} from 'store/atoms/ingestAtom';
import AgentList from './AgentList';
import AgentPaging from './AgentPaging';
import AgentSearch from './AgentSearch';
import AgentTitle from './AgentTitle';

function AgentAside() {
  const pageCount = 5;
  const listCount = 10;

  const [lastPage, setLastPage] = useState(0);
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(pageCount);
  const [agentList, setAgentList] = useState<agentDTO[]>([]);
  const [searchOption, setSearchOption] = useState({
    curPage: pageStart - 1,
    size: listCount,
  });

  const navigate = useNavigate();
  const resetAgentData = useResetRecoilState(agentState);
  const resetAgentModelData = useResetRecoilState(agentModelState);
  const [agentMode, setAgentMode] = useRecoilState(agentModeState);
  const [selectedAgent, setSelectedAgent] = useState('');

  const [info, isAdmin] = UseInfo();

  const updatePage = () => {
    getAgentList(searchOption)
      .then((res) => {
        setAgentList(res.data);
        setLastPage(res.totalPage);
        setSelectedAgent(res.data[0].name);
      })
      .catch(() => {
        setAgentList([]);
        setLastPage(1);
        setSelectedAgent('');
      });
  };

  const { registerUpdateFuncion } = useRefreshTrigger();
  useEffect(() => {
    updatePage();
    registerUpdateFuncion([updatePage]);
  }, [searchOption]);

  // TODO: uncomment this after the ETRI demonstration
  // useEffect(() => {
  //   navigate(`./${selectedAgent}/agent-info`);
  // }, [selectedAgent]);

  const moveAddPage = () => {
    resetAgentData();
    resetAgentModelData();
    setAgentMode('add');
    navigate('./new-agent');
  };

  const moveHistoryPage = () => {
    resetAgentData();
    resetAgentModelData();
    setAgentMode('read');
    navigate('./history-agent');
  };

  return (
    <div className="agent-accordion">
      <AgentTitle />
      <AgentSearch />
      <div className="agent-aside">
        <AgentList agentList={agentList} />

        <AgentPaging
          pageStart={pageStart}
          setPageStart={setPageStart}
          pageEnd={pageEnd}
          setPageEnd={setPageEnd}
          searchOption={searchOption}
          setSearchOption={setSearchOption}
          lastPage={lastPage}
          pageCount={pageCount}
          updatePage={updatePage}
        />
      </div>
      {isAdmin && (
        <div className="button-wrapper">
          <RectangleButton
            type="history"
            text="History"
            onClick={moveHistoryPage}
          />
          <RectangleButton
            type="add"
            text="Add New Agent"
            onClick={moveAddPage}
          />
        </div>
      )}
    </div>
  );
}

export default AgentAside;
