import { useEffect, useState } from 'react';
import { IModelAttributeAsideSearch } from 'types/common';

export const useAsideSearch = (refetch: any) => {
  const [searchOption, setSearchOption] = useState<IModelAttributeAsideSearch>({
    curPage: 0,
    size: 10,
  });

  const setSearchOptionHandle = (value: IModelAttributeAsideSearch) => {
    setSearchOption((prev) => {
      return { ...prev, ...value };
    });
  };

  const searchOptionFormatter = (item: string) => {
    switch (item) {
      case '':
        return undefined;
      case 'true':
        return true;
      case 'false':
        return false;
      default:
        return undefined;
    }
  };

  useEffect(() => {
    refetch();
  }, [searchOption.curPage]);

  const submit = () => {
    if (searchOption.curPage === 0) {
      return refetch();
    }
    return setSearchOptionHandle({ curPage: 0 });
  };

  return { searchOption, setSearchOptionHandle, searchOptionFormatter, submit };
};
