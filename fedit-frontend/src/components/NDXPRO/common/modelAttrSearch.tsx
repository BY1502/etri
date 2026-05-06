import AttrSearch from 'components/NDXPRO/dataModel/dataModelAttributeContent/attrSearch';
import ModelSearch from 'components/NDXPRO/dataModel/dataModelAttributeContent/modelSearch';
import { Dispatch, SetStateAction } from 'react';

interface optionsProps {
  curPage: number;
  size?: number;
  word?: string;
  isReady?: boolean;
}

interface IProps {
  pagePath: string | undefined;
  searchOption: optionsProps;
  setSearchOption: Dispatch<SetStateAction<any>>;
}

function ModelAttrSearch({ pagePath, searchOption, setSearchOption }: IProps) {
  const isModel = () => {
    if (pagePath === 'data-model') {
      return true;
    }
    return false;
  };

  const submitSearchForm = (payload: any) => {
    setSearchOption({ ...searchOption, ...payload });
  };

  return (
    <div className="model-attr-search">
      {!isModel() && <AttrSearch submitSearchForm={submitSearchForm} />}
      {isModel() && <ModelSearch submitSearchForm={submitSearchForm} />}
    </div>
  );
}

export default ModelAttrSearch;
