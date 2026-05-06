import { dateFormatter, getDate, getRangeBefore, returnStatesByType } from '.';

const date20230101 = new Date('2023. 1 .1');
test('YYYY-MM-DD의 형식으로 변환', () => {
  expect(dateFormatter(date20230101)).toBe('2023-01-01');
});

test('날짜와 num을 받아 날짜+num일을 반환', () => {
  expect(getDate(date20230101, 7)).toBe('2023-01-08');
});

test('날짜와 num을 받아 객체 { startDate: 날짜-num, endDate: 날짜 } 를 반환', () => {
  expect(getRangeBefore(dateFormatter(date20230101), 7)).toStrictEqual({
    startDate: '2023-01-01',
    endDate: '2023-01-08',
  });
});

test('type이 dataModelStatistics일 때', () => {
  expect(returnStatesByType('dataModelStatistics')).toStrictEqual({
    title: 'Model Type',
    onClickState: 'dataModel',
  });
});

test('type이 잘못 들어왔을 때', () => {
  expect(returnStatesByType('')).toBeNull();
});
