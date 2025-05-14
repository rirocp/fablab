import { TDateISO } from '../typings/date-iso';
import { PaymentConfirmation } from './payment';
import { CreateTokenResponse } from './payzen';
import { UserRole } from './user';
import { Coupon } from './coupon';
import { ApiFilter, PaginatedIndex } from './api';
import type { CartItemReservationType, CartItemType } from './cart_item';

export type OrderableType = 'Product' | CartItemType;

export type OrderState = 'cart'|'paid'|'payment_failed'|'refunded'|'in_progress'|'ready'|'canceled'|'delivered'|'late';

export interface OrderItem {
  id: number,
  orderable_type: OrderableType,
  orderable_id: number,
  orderable_name: string,
  orderable_slug: string,
  orderable_main_image_url?: string;
  quantity: number,
  amount: number,
  is_offered: boolean
}

export interface OrderProduct extends OrderItem {
  orderable_type: 'Product',
  orderable_ref?: string,
  orderable_external_stock: number,
  quantity_min: number
}

export interface OrderCartItemReservation extends OrderItem {
  orderable_type: CartItemReservationType
  slots_reservations: Array<{
    id: number,
    offered: boolean,
    slot: {
      id: number,
      start_at: TDateISO,
      end_at: TDateISO
    }
  }>
}

export interface OrderActivity {
  id: number,
  activity_type: string,
  created_at: TDateISO,
  note?: string,
  operator?: {
    id: number,
    name: string
  }
}

export interface Order {
  id: number,
  token: string,
  statistic_profile_id?: number,
  user?: {
    id: number,
    role: UserRole
    name?: string,
  },
  operator_profile_id?: number,
  reference?: string,
  state?: OrderState,
  total?: number,
  coupon?: Coupon,
  created_at?: TDateISO,
  updated_at?: TDateISO,
  invoice_id?: number,
  payment_method?: string,
  payment_date?: TDateISO,
  wallet_amount?: number,
  paid_total?: number,
  project?: string,
  order_items_attributes: Array<OrderItem>,
  order_activities?: Array<OrderActivity>,
  paid_at?: TDateISO,
  in_progress_at?: TDateISO,
  canceled_at?: TDateISO,
  refunded_at?: TDateISO,
}

export interface OrderPayment {
  order: Order,
  payment?: PaymentConfirmation|CreateTokenResponse
}

export type OrderIndex = PaginatedIndex<Order>;

export type OrderSortOption = 'created_at-asc' | 'created_at-desc' | '';

export interface OrderIndexFilter extends ApiFilter {
  reference?: string,
  user_id?: number,
  user?: {
    id: number,
    name?: string,
  },
  page?: number,
  sort?: OrderSortOption
  states?: Array<OrderState>,
  period_from?: string,
  period_to?: string
}

export interface ItemError {
  error: string,
  value?: string|number
}
export interface OrderErrors {
  order_id: number,
  details: Array<{
    item_id: number,
    errors: Array<ItemError>
  }>
}
