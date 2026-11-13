export type Service = {
  service_code: string;
  vehicle_type: "sedan" | "suv";
  service_name: string;
  base_price_zar: number;
  duration_minutes: number;
};

export type Zone = {
  suburb: string;
  travel_fee_zar: number;
  served: boolean;
};

export type Customer = {
  customer_id: string;
  demo_name: string;
  vehicle_type: "sedan" | "suv";
  suburb: string;
  contact_email: string;
};

export type Booking = {
  booking_id: string;
  customer_id: string;
  demo_name: string;
  service_code: string;
  suburb: string;
  date_sast: string;
  start_time_sast: string;
  end_time_sast: string;
  total_zar: number;
  status: "CONFIRMED";
  /** The two employees responsible for this job. Set when the booking is confirmed. */
  staff?: string[];
  /** Position of this job in that day's running order (by start time) when it was confirmed. */
  queue_number?: number;
};

export const SERVICES: Service[] = [
  {
    service_code: "WASH_SEDAN",
    vehicle_type: "sedan",
    service_name: "Exterior and interior wash",
    base_price_zar: 120,
    duration_minutes: 90,
  },
  {
    service_code: "WASH_SUV",
    vehicle_type: "suv",
    service_name: "Exterior and interior wash",
    base_price_zar: 160,
    duration_minutes: 90,
  },
];

export const WASH_BAY = "our wash bay";

export const ZONES: Zone[] = [
  { suburb: "Rosebank", travel_fee_zar: 0, served: true },
  { suburb: "Parkwood", travel_fee_zar: 0, served: true },
  { suburb: "Parkhurst", travel_fee_zar: 20, served: true },
  { suburb: "Melville", travel_fee_zar: 30, served: true },
  // Client brings the car to the wash: no travel. Matched by phrases such as "I'll bring it".
  { suburb: WASH_BAY, travel_fee_zar: 0, served: true },
];

export const CUSTOMERS: Customer[] = [
  {
    customer_id: "C001",
    demo_name: "Lerato Demo",
    vehicle_type: "sedan",
    suburb: "Rosebank",
    contact_email: "lerato.demo@example.com",
  },
  {
    customer_id: "C002",
    demo_name: "Thabo Demo",
    vehicle_type: "suv",
    suburb: "Melville",
    contact_email: "thabo.demo@example.com",
  },
];

export const BOOKINGS: Booking[] = [
  {
    booking_id: "B001",
    customer_id: "C001",
    demo_name: "Lerato Demo",
    service_code: "WASH_SEDAN",
    suburb: "Rosebank",
    date_sast: "2026-11-14",
    start_time_sast: "09:00",
    end_time_sast: "10:30",
    total_zar: 120,
    status: "CONFIRMED",
    staff: ["Kamo", "Lovely"],
    queue_number: 1,
  },
  {
    booking_id: "B002",
    customer_id: "C002",
    demo_name: "Thabo Demo",
    service_code: "WASH_SUV",
    suburb: "Melville",
    date_sast: "2026-11-14",
    start_time_sast: "15:00",
    end_time_sast: "16:30",
    total_zar: 190,
    status: "CONFIRMED",
    staff: ["Sipho", "Zanele"],
    queue_number: 2,
  },
];

export const DEMO_TODAY = "2026-11-13";
export const SLOTS = ["09:00", "11:00", "13:00", "15:00"] as const;
export type Slot = (typeof SLOTS)[number];

export const END_BY_START: Record<Slot, string> = {
  "09:00": "10:30",
  "11:00": "12:30",
  "13:00": "14:30",
  "15:00": "16:30",
};

/**
 * The owner's team and the slots each person works (Monday to Saturday).
 * A slot can be booked while at least two employees are free in it; each booking uses two.
 * Replace these names and shifts with the real team.
 */
export type Staff = { name: string; slots: readonly Slot[] };

export const STAFF: Staff[] = [
  { name: "Kamo", slots: SLOTS },
  { name: "Lovely", slots: SLOTS },
  { name: "Sipho", slots: ["13:00", "15:00"] },
  { name: "Zanele", slots: ["13:00", "15:00"] },
];
