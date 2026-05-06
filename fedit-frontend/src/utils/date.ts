export function convertFullDateTimeFromString(dateString: string) {
  const dateInstance = new Date(dateString);

  const year = dateInstance.getFullYear();

  const month = dateInstance.getMonth() + 1;
  const padingMonth = month.toString().padStart(2, '0');

  const date = dateInstance.getDate();
  const padingDate = date.toString().padStart(2, '0');

  const hours = dateInstance.getHours();
  const padingHours = hours.toString().padStart(2, '0');

  const minutes = dateInstance.getMinutes();
  const padingMinutes = minutes.toString().padStart(2, '0');

  const seconds = dateInstance.getSeconds();
  const padingSeconds = seconds.toString().padStart(2, '0');

  const milliseconds = dateInstance.getMilliseconds();

  return `${year}-${padingMonth}-${padingDate} ${padingHours}:${padingMinutes}:${padingSeconds}.${milliseconds}`;
}

export function convertDateTimeLocalFormat(date: Date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  const isoString = new Date(date.getTime() - tzOffset).toISOString();
  const secondSeparatorIndex = isoString.lastIndexOf(':');
  return isoString.slice(0, secondSeparatorIndex);
}

export function subtractMonth(date: Date, months: number) {
  date.setMonth(date.getMonth() - months);
  return date;
}

export function formatDateParts(date: Date | null) {
  if (!date) return null;

  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    weekday: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true,
  };

  const formatter = new Intl.DateTimeFormat('en-us', options);
  const parts = formatter.formatToParts(date);

  const dateParts: { [key: string]: string } = {};
  parts.forEach((part) => {
    dateParts[part.type] = part.value;
  });

  const milliseconds = date.getMilliseconds();
  return {
    ...dateParts,
    milliseconds,
  };
}
