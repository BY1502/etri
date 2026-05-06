import Skeleton from 'components/skeleton/skeleton';

function TimeDisplay({ label, dateTime, isVisible }: any) {
  return (
    <div className="flex h-[100px] flex-col rounded-lg bg-white p-4 shadow-card">
      {dateTime && isVisible ? (
        <>
          <p className="text-[18px] font-bold">{label}</p>
          <div className="flex h-full flex-col justify-center pb-[12px]">
            <p className="text-center text-[28px] font-bold">
              {dateTime.hour}:{dateTime.minute}:{dateTime.second}{' '}
              {dateTime.dayPeriod}
            </p>
            {/* <p className="text-center text-[18px] font-medium">
              {dateTime.weekday}, {dateTime.month} {dateTime.day}
            </p> */}
          </div>
        </>
      ) : (
        <>
          <Skeleton className="h-[27px] w-1/3 text-[18px] font-medium" />
          <div className="flex h-full flex-col justify-center pb-[12px]">
            <Skeleton className="m-auto my-[4px] h-[40px] w-2/5" />
          </div>
        </>
      )}
    </div>
  );
}

export default TimeDisplay;
