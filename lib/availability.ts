import { TIME_SLOT, type TimeSlotValue } from "@/lib/schedule-rules";
import { toDateKey } from "@/lib/date-utils";

export type UnavailableRecord = {
  doctorId: string;
  date: Date | string;
  timeSlot: string;
};

export function isDoctorUnavailable(
  unavailableTimes: UnavailableRecord[],
  doctorId: string,
  date: Date | string,
  timeSlot: TimeSlotValue
) {
  const dateKey = toDateKey(date);
  return unavailableTimes.some((item) => {
    if (item.doctorId !== doctorId || toDateKey(item.date) !== dateKey) {
      return false;
    }

    if (timeSlot === TIME_SLOT.FULL_DAY) {
      return (
        item.timeSlot === TIME_SLOT.FULL_DAY ||
        item.timeSlot === TIME_SLOT.MORNING ||
        item.timeSlot === TIME_SLOT.AFTERNOON
      );
    }

    if (item.timeSlot === TIME_SLOT.FULL_DAY) {
      return true;
    }

    return item.timeSlot === timeSlot;
  });
}
