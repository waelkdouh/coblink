import { formatDate } from '@angular/common';
import { Inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';

import { CALENDAR_DATE_FORMAT, parseCalendarDate } from '../utils/date-utils';

/**
 * Short date (`3/14/2025`) for calendar dates (due date, notice date, date of service, ...).
 * The API sends `2025-03-14T00:00:00` without a zone: the pipe builds a local date from the year, month and day,
 * so the day never shifts with the browser's time zone (DatePipe would read the value as UTC in some browsers).
 * Timestamps that end in Z are different: show those with the regular `date` pipe.
 */
@Pipe({ name: 'calendarDate' })
export class CalendarDatePipe implements PipeTransform {
  constructor(@Inject(LOCALE_ID) private readonly locale: string) {}

  transform(value: string | Date | null | undefined, format = CALENDAR_DATE_FORMAT): string {
    const date = parseCalendarDate(value);
    return date ? formatDate(date, format, this.locale) : '';
  }
}
