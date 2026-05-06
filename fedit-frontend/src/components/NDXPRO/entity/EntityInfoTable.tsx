import { useActiveEntityTab } from 'components/NDXPRO/hooks/useActiveEntityTab';
import InfoContainer from './InfoContainer';

function EntityInfoTable() {
  const activeTab = useActiveEntityTab();
  return (
    <InfoContainer
      title="Entity 정보"
      path={[]}
      className="entity-info-table-wrapper"
    >
      <table>
        <tbody>
          <tr>
            <th>Entity ID</th>
            <td>{activeTab.entityId}</td>
          </tr>
          <tr>
            <th>Context</th>
            <td>{activeTab.contextId}</td>
          </tr>
          <tr>
            <th>Data Model</th>
            <td>{activeTab.modelId}</td>
          </tr>
        </tbody>
      </table>
    </InfoContainer>
  );
}

export default EntityInfoTable;
