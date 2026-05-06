export const dateFormatter = (date: number | Date | undefined) => {
  const baseFormat = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return baseFormat.replaceAll('.', '').replaceAll(' ', '-');
};

export const getDate = (date: Date, num: number) => {
  return dateFormatter(new Date(date.setDate(date.getDate() + num)));
};

export const getRangeBefore = (dateStr: string, num: number) => {
  return {
    startDate: getDate(new Date(dateStr), -num),
    endDate: getDate(new Date(dateStr), 0),
  };
};

export const returnStatesByType = (type: string) => {
  switch (type) {
    case 'dataModelStatistics':
      return { title: 'Model Type', onClickState: 'dataModel' };
    case 'dataModelNameList':
      return { title: 'Model Type', onClickState: 'dataModel' };
    case 'sourceStatistics':
      return { title: 'Provider', onClickState: 'provider' };
    default:
      return null;
  }
};
