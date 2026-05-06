import { useQuery } from '@tanstack/react-query';

import { getAllModelWithPage } from 'apis/NDXPRO/modelApi';

import { useAsideSearch } from 'components/NDXPRO/hooks/useAsideSearch';

import { IDataModelListItem } from 'types/model';

import { useParams } from 'react-router';
import { NavLink } from 'react-router-dom';

import InputContainer from 'components/NDXPRO/common/inputContainer';
import AsideList from 'components/NDXPRO/common/ModelAttributeAside/asideList';
import AsideListItem from 'components/NDXPRO/common/ModelAttributeAside/asideListItem';
import AsidePagination from 'components/NDXPRO/common/ModelAttributeAside/asidePagination';
import AsideSearch from 'components/NDXPRO/common/ModelAttributeAside/asideSearch';
import Select from 'components/NDXPRO/common/select';
import StatisticsError from 'components/NDXPRO/statistics/statisticsContent/statisticsError';
import StatisticsLoading from 'components/NDXPRO/statistics/statisticsContent/statisticsLoading';

const isReadyOption = [
  { label: 'All', value: '' },
  { label: 'Ready', value: 'true' },
  { label: 'Not Ready', value: 'false' },
];

function ModelAside() {
  const params = useParams();

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['getAllModelWithPage'],
    queryFn: () => getAllModelWithPage(searchOption),
  });

  const { searchOption, setSearchOptionHandle, searchOptionFormatter, submit } =
    useAsideSearch(refetch);

  if (isLoading) {
    return <StatisticsLoading />;
  }

  if (error) {
    return <StatisticsError />;
  }

  const searchSelect = (
    <>
      <InputContainer
        label="Rows"
        contentNode={
          <Select
            selectedValue={searchOption.size}
            dataList={[5, 10, 15, 20]}
            onChange={(e) =>
              setSearchOptionHandle({
                size: Number(e.target.value),
              })
            }
          />
        }
      />
      <InputContainer
        label="IsReady"
        contentNode={
          <Select
            selectedValue={searchOption.isReady?.toString() ?? ''}
            dataList={isReadyOption}
            onChange={(e) =>
              setSearchOptionHandle({
                isReady: searchOptionFormatter(e.target.value),
              })
            }
          />
        }
      />
    </>
  );

  return (
    <aside className="model-attribute-aside">
      <div>
        <h1>Data Model</h1>
        <AsideSearch
          content={
            <input
              type="text"
              defaultValue={searchOption.word}
              onChange={(e) => setSearchOptionHandle({ word: e.target.value })}
              placeholder="Search..."
            />
          }
          onClick={submit}
        >
          {searchSelect}
        </AsideSearch>
        <AsideList isFetching={isFetching}>
          {data.data.length === 0 && <div>No Data</div>}
          {data.data.map((e: IDataModelListItem) => (
            <AsideListItem
              key={e.dataModelId}
              link={e.type}
              text={e.type}
              active={e.type === params['*']}
              isReady={e.isReady}
            />
          ))}
        </AsideList>
        <AsidePagination
          totalPage={data.totalPage}
          searchOption={searchOption}
          setSearchOption={setSearchOptionHandle}
        />
      </div>
      <NavLink
        className="model-attribute-aside-add-btn"
        to={{
          pathname: '/service-description-tool/object-data-model-management',
        }}
      >
        Add New Model
      </NavLink>
    </aside>
  );
}

export default ModelAside;
