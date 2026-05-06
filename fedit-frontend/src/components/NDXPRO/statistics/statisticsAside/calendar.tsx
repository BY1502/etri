import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import { useCalendar } from '../hooks/useCalendar';

function StatisticsCalendar() {
  const {
    toggleClickable,
    calendarRef,
    yesterdayStr,
    handleDateClick,
    handleLatestClick,
    handlePrevClick,
    handleNextClick,
  } = useCalendar();

  return (
    <div className={toggleClickable ? '' : 'calendar-disable'}>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        dateClick={({ dateStr }) => {
          handleDateClick(dateStr);
        }}
        titleFormat={{ year: 'numeric', month: '2-digit' }}
        dayHeaderFormat={{ weekday: 'short' }}
        headerToolbar={{
          center: 'title',
          left: 'customPrev',
          right: 'customNext latest',
        }}
        customButtons={{
          latest: {
            text: 'latest',
            click: handleLatestClick,
          },
          customPrev: { icon: 'prev-button', click: handlePrevClick },
          customNext: { icon: 'next-button', click: handleNextClick },
        }}
        initialDate={yesterdayStr}
        showNonCurrentDates={false}
      />
    </div>
  );
}

export default StatisticsCalendar;
