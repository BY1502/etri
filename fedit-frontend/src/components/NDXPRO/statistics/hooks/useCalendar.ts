import FullCalendar from '@fullcalendar/react';
import { getStatisticsDateList } from 'apis/NDXPRO/statisticsApi';
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { clickable, currentDate } from '../store';
import { getDate } from '../utils';
import useAsync from './useAsync';

const getDayCell = (date: string) => {
  const dayEl = document.querySelector(`[data-date="${date}"]`);
  return dayEl;
};

const dayCellSelector = (date: string) => {
  const AlldayEl = document.querySelectorAll(`.fc-day`);
  AlldayEl.forEach((el) => {
    el.classList.remove('current-day');
  });
  const dayEl = getDayCell(date);
  dayEl?.classList.add('current-day');
};

const setDayEl = (data: string[]) => {
  data.forEach((date: string) => {
    const dayEl = getDayCell(date);
    dayEl?.classList.add('statistics-day');
  });
};

export const useCalendar = () => {
  const today = new Date();
  const yesterdayStr = getDate(today, -1);
  const calendarRef = useRef<FullCalendar>(null);

  const [date, setDate] = useRecoilState(currentDate);
  const toggleClickable = useRecoilValue(clickable);

  const cal = calendarRef.current?.getApi();

  interface IDateList {
    year: number;
    month: number;
  }

  const [dateConfig, setDateConfig]: [
    IDateList,
    Dispatch<SetStateAction<IDateList>>,
  ] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  const updateDateConfig = () => {
    if (!cal) {
      return;
    }
    const getYear = cal.getDate().getFullYear();
    const getMonth = cal.getDate().getMonth() + 1;
    setDateConfig({
      year: getYear,
      month: getMonth,
    });
  };

  useEffect(() => {
    updateDateConfig();
  }, []);

  useEffect(() => {
    if (date) {
      changeCalDate(date);
      dayCellSelector(date);
    }
  }, [date]);

  const [dateList, loading, error, fetch] = useAsync(
    getStatisticsDateList,
    dateConfig,
    dateConfig,
  );

  useEffect(() => {
    dayCellSelector(date);
    if (dateList) {
      setDayEl(dateList);
    }
  }, [dateList]);

  const changeCalDate = (date: string) => {
    cal?.gotoDate(date);
  };

  const handleLatestClick = () => {
    if (!toggleClickable) {
      return;
    }

    setDate(yesterdayStr);
    changeCalDate(yesterdayStr);
    updateDateConfig();
  };

  const handlePrevClick = () => {
    if (!toggleClickable) {
      return;
    }

    cal?.prev();
    updateDateConfig();
  };

  const handleNextClick = () => {
    if (!toggleClickable) {
      return;
    }

    cal?.next();
    updateDateConfig();
  };

  const handleDateClick = (d: string) => {
    if (!toggleClickable) {
      return;
    }

    setDate(d);
    changeCalDate(d);
    dayCellSelector(date);
  };

  return {
    toggleClickable,
    calendarRef,
    yesterdayStr,
    handleDateClick,
    handleLatestClick,
    handlePrevClick,
    handleNextClick,
  };
};
