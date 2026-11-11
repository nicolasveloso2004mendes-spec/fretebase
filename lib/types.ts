export type Client = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  payment_terms: string | null;
  notes: string | null;
  created_at: string;
};

export type Vehicle = {
  id: string;
  name: string;
  plate: string | null;
  consumption_km_l: number;
  maintenance_per_km: number;
  tire_per_km: number;
  created_at: string;
};

export type OrderStatus = "novo" | "cotado" | "cancelado";
export type Order = {
  id: string;
  client_id: string | null;
  origin: string;
  destination: string;
  cargo: string | null;
  weight_kg: number | null;
  desired_date: string | null;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
  clients?: { name: string } | null;
};

export type QuoteStatus = "rascunho" | "enviada" | "aprovada" | "recusada";
export type Quote = {
  id: string;
  client_id: string | null;
  order_id: string | null;
  vehicle_id: string | null;
  origin: string;
  destination: string;
  distance_km: number;
  round_trip: boolean;
  cargo: string | null;
  consumption_km_l: number;
  diesel_price: number;
  maintenance_per_km: number;
  tire_per_km: number;
  tolls: number;
  driver_cost: number;
  other_cost: number;
  tax_pct: number;
  freight_value: number;
  cost_total: number;
  profit: number;
  terms: string | null;
  status: QuoteStatus;
  follow_up_date: string | null;
  created_at: string;
  clients?: { name: string } | null;
};

export type TripStatus = "agendada" | "em_viagem" | "entregue" | "cancelada";
export type PaymentStatus = "pendente" | "pago";
export type Trip = {
  id: string;
  quote_id: string | null;
  client_id: string | null;
  vehicle_id: string | null;
  origin: string;
  destination: string;
  pickup_date: string | null;
  delivery_date: string | null;
  status: TripStatus;
  freight_value: number;
  cost_total: number;
  payment_status: PaymentStatus;
  payment_due: string | null;
  paid_at: string | null;
  created_at: string;
  clients?: { name: string } | null;
  vehicles?: { name: string; plate: string | null } | null;
};

/* ---------- Fase 3 ---------- */
export type VehicleStatus = "disponivel" | "em_viagem" | "manutencao" | "inativo";
export type VehicleFull = Vehicle & {
  brand: string | null; model: string | null; year: number | null; truck_type: string | null; axles: number | null; axle_config: string | null;
  capacity_kg: number | null; odometer_km: number; consumption_loaded: number | null; consumption_empty: number | null;
  fuel_type: string | null; status: VehicleStatus;
};
export type Driver = { id: string; name: string; phone: string | null; cnh_category: string | null; cnh_expiry: string | null; active: boolean; user_id: string | null; created_at: string };
export type VehicleDoc = { id: string; vehicle_id: string; kind: string; number: string | null; expires_on: string | null; file_path: string | null; notes: string | null; created_at: string };
export type MaintenanceRecord = {
  id: string; vehicle_id: string; kind: string; description: string | null; status: "agendada" | "concluida"; done_date: string | null;
  odometer_km: number | null; parts_cost: number; labor_cost: number; supplier: string | null; next_due_date: string | null; next_due_km: number | null; created_at: string;
  vehicles?: { name: string; plate: string | null } | null;
};
export type FuelLogRow = {
  id: string; vehicle_id: string; driver_id: string | null; trip_id: string | null; date: string; location: string | null; odometer_km: number; liters: number;
  price_per_liter: number; total_value: number; fuel_type: string | null; full_tank: boolean; receipt_path: string | null; created_at: string;
  vehicles?: { name: string; plate: string | null } | null;
};
export type TripExpense = { id: string; trip_id: string; kind: string; amount: number; date: string; description: string | null; receipt_path: string | null; fuel_log_id: string | null; created_at: string };
export type TireRow = {
  id: string; code: string; brand: string | null; model: string | null; size: string | null; vehicle_id: string | null; position: string | null; status: string;
  installed_at: string | null; installed_km: number | null; km_before: number; purchase_cost: number; retread_count: number; alert_km: number | null; notes: string | null; created_at: string;
  vehicles?: { name: string; plate: string | null } | null;
};
export type TripFull = Trip & { driver_id: string | null; cargo: string | null; instructions: string | null; distance_km: number | null; planned_cost: number; tax_value: number; picked_up_at: string | null; started_at: string | null; delivered_at: string | null; drivers?: { name: string } | null };
export type TripEvent = { id: string; trip_id: string; kind: string; note: string | null; created_at: string };
export type Checklist = { id: string; trip_id: string; items: Record<string, string>; notes: string | null; photo_paths: string[] | null; has_critical: boolean; authorized_by: string | null; authorized_at: string | null; authorization_note: string | null; created_at: string };
export type DeliveryProof = { id: string; trip_id: string; received_by: string; notes: string | null; photo_paths: string[] | null; signature_path: string | null; signature_kind: string; confirmed_at: string };
export type DriverTrip = { id: string; origin: string; destination: string; cargo: string | null; instructions: string | null; status: TripStatus; pickup_date: string | null; delivery_date: string | null; picked_up_at: string | null; started_at: string | null; delivered_at: string | null; vehicle_id: string | null; vehicle_name: string | null; vehicle_plate: string | null; created_at: string };
