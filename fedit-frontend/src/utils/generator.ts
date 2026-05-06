import { ValueType } from 'types/entity';

export const qQueryGenerator = (
  criteria: string | undefined,
  valueType: ValueType | undefined,
  value: string | undefined,
  excludeList?: string[],
): string => {
  if (!(criteria && valueType && value)) {
    return '';
  }
  if (
    !criteria ||
    (excludeList &&
      excludeList.find((excludeText) => criteria.includes(excludeText)))
  ) {
    return '';
  }

  let qQuery = '';

  if (['String', 'Enum'].includes(valueType) && value) {
    qQuery += `${criteria}~=${encodeURI(value)};`;
  } else if (['DateTime'].includes(valueType) && value) {
    qQuery += `${criteria}>=${value}:00.0;${criteria}<=${value}:59.999;`;
  } else if (['Integer', 'Double'].includes(valueType)) {
    const [greaterValue, lessValue] = value.split(':=:');

    if (greaterValue && lessValue && +greaterValue > +lessValue) {
      throw new Error(
        `${criteria}의 greaterValue(좌측)의 값은 lessValue(우측)의 값보다 작게 설정해주세요.`,
      );
    }

    if (greaterValue) {
      qQuery += `${criteria}>=${greaterValue};`;
    }

    if (lessValue) {
      qQuery += `${criteria}<=${lessValue}`;
    }
  }

  return qQuery;
};
