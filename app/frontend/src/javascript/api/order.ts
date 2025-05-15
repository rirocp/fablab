import apiClient from './clients/api-client';
import { AxiosResponse } from 'axios';
import { Order, OrderIndexFilter, OrderIndex } from '../models/order';
import ApiLib from '../lib/api';

export default class OrderAPI {
  static async index (filters?: OrderIndexFilter): Promise<OrderIndex> {
    const res: AxiosResponse<OrderIndex> = await apiClient.get(`/api/orders${ApiLib.filtersToQuery(filters, false)}`);
    return res?.data;
  }

  static async get (id: number | string): Promise<Order> {
    const res: AxiosResponse<Order> = await apiClient.get(`/api/orders/${id}`);
    return res?.data;
  }

  static async updateState (order: Order, state: string, note?: string): Promise<Order> {
    console.log(`Updating order ${order.id} state to ${state}`, order);
    const res: AxiosResponse<Order> = await apiClient.patch(`/api/orders/${order.id}`, { order: { state, note } });
    console.log('Update response:', res.data);
    return res?.data;
  }

  static async withdrawalInstructions (order?: Order): Promise<string> {
    const res: AxiosResponse<string> = await apiClient.get(`/api/orders/${order?.id}/withdrawal_instructions`);
    return res?.data;
  }

  static async update (id: number | string, data: Partial<Order>): Promise<Order> {
    const res: AxiosResponse<Order> = await apiClient.patch(`/api/orders/${id}`, { order: data });
    return res?.data;
  }
}
