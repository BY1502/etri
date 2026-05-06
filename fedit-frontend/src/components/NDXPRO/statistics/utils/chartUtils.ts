export const chartOption = {
  plugins: {
    legend: {
      display: false,
    },
  },
  interaction: {
    mode: 'nearest' as const,
  },
  maintainAspectRatio: false,
  resizeDelay: 500,
};

const hexToRgb = (hex: string) => {
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);

  return `${r}, ${g}, ${b}`;
};

const getColorList = (color: string): string => {
  const appElement = document.getElementById('app');
  if (!appElement) {
    return '';
  }

  const computedStyle = getComputedStyle(appElement);
  const colorValue = computedStyle.getPropertyValue(color).trim();
  if (!computedStyle) {
    return '';
  }

  return colorValue;
};

export const barChartColorSet = ({ range }: { range: number }) => {
  const blue = hexToRgb(getColorList('--blue'));
  const red = hexToRgb(getColorList('--red'));

  const successColorList: Array<string> = [];
  const failColorList: Array<string> = [];

  for (let i = 0; i < range; i += 1) {
    successColorList.push(`rgba(${blue},0.5)`);
    failColorList.push(`rgba(${red},0.5)`);
  }
  successColorList.push(`rgba(${blue},1)`);
  failColorList.push(`rgba(${red},1)`);

  const obj = {
    successColorSet: successColorList,
    failColorSet: failColorList,
  };

  return obj;
};

export const donutChartColorSet = () => {
  const blue = hexToRgb(getColorList('--blue'));
  const red = hexToRgb(getColorList('--red'));

  return [`rgba(${blue},1`, `rgba(${red},1`];
};
