import { getAgentHistoryList } from 'apis/NDXPRO/IngestApi';
import { useEffect, useState } from 'react';
import { agentHistoryVO } from 'types/ingest';
import AgentNav from '../agentContent/AgentNav';
import AgentHistoryList from './AgentHistoryList';
import AgentHistoryPaging from './AgentHistoryPaging';

function AgentHistory() {
  const pageCount = 5;
  const listCount = 18;

  const [lastPage, setLastPage] = useState(0);
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(pageCount);
  const [agentHistoryList, setAgentHistoryList] = useState<agentHistoryVO[]>(
    [],
  );
  const [searchOption, setSearchOption] = useState({
    curPage: pageStart - 1,
    size: listCount,
  });

  const updatePage = () => {
    getAgentHistoryList(searchOption)
      .then((res) => {
        setAgentHistoryList(res.data);
        setLastPage(res.totalPage);
      })
      .catch(() => {
        setAgentHistoryList([]);
        setLastPage(1);
      });
  };

  useEffect(() => {
    updatePage();
  }, []);

  return (
    <div className="agent-sub-page">
      <div className="agent-sub-page-wrapper">
        <AgentNav />
        <div className="agent-info-wrapper">
          <div className="agent-history-div">
            <AgentHistoryList agentHistoryList={agentHistoryList} />
            <AgentHistoryPaging
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
        </div>
      </div>
    </div>
  );
}

export default AgentHistory;
